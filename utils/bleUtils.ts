import {
  BleManager,
  Device,
  Subscription,
  State,
  ScanMode,
} from "react-native-ble-plx";
import { Buffer } from "buffer";
import { PermissionsAndroid, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const bleManager = new BleManager();
export const BLE_STORAGE_KEYS = {
  CONNECTED_DEVICE: "ble_connected_device",
  SCHEDULE_ID: "ble_current_schedule_id",
  USER_ROLE: "ble_user_role",
};

export interface BLEScanOptions {
  filterByManufacturer?: string;
  serviceUUIDs?: string[];
  timeout?: number;
  autoConnect?: boolean;
  onDeviceFound?: (device: Device) => void;
  // Added to allow external config (from background task)
  scanMode?: ScanMode;
  allowDuplicates?: boolean;
}

export interface BLECallbacks {
  onDeviceFound?: (device: Device) => void;
  onDeviceConnected?: (device: Device) => void;
  onDeviceDisconnected?: (deviceId: string) => void;
  onError?: (error: any) => void;
  onScanStarted?: () => void;
  onScanStopped?: () => void;
}

interface StoredDevice {
  id: string;
  name: string | null;
  manufacturerData: string | null;
}

class BLEUtils {
  private isScanning = false;
  private connectedDevice: Device | null = null;
  private callbacks: BLECallbacks = {};
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;
  private userRole: "instructor" | "student" | null = null;
  private connectionSubscriptions: Map<string, Subscription> = new Map();
  private rescanInterval: ReturnType<typeof setInterval> | null = null;
  private seenDevices: Set<string> = new Set();
  private backgroundDeviceCallback: ((device: Device) => void) | null = null;
  private readonly PASSWORD = "presensure";

  private async sendPassword(deviceId: string): Promise<boolean> {
    try {
      console.log(`🔐 Sending password to ${deviceId}`);

      await this.writeToCharacteristic(
        deviceId,
        "4fafc201-1fb5-459e-8fcc-c5c9c331914b",
        "beb5483e-36e1-4688-b7f5-ea07361b26a8",
        this.PASSWORD
      );

      console.log("✅ Password sent successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to send password:", error);
      return false;
    }
  }

  async getBluetoothState(): Promise<State> {
    return new Promise((resolve, reject) => {
      const subscription = bleManager.onStateChange((state) => {
        subscription.remove();
        resolve(state);
      }, true);
      bleManager.state().then(resolve).catch(reject);
    });
  }

  setCallbacks(callbacks: BLECallbacks): void {
    this.callbacks = callbacks;
  }

  setBackgroundDeviceCallback(callback: (device: Device) => void): void {
    this.backgroundDeviceCallback = callback;
  }

  clearBackgroundDeviceCallback(): void {
    this.backgroundDeviceCallback = null;
  }

  setUserRole(role: "instructor" | "student"): void {
    this.userRole = role;
  }

  async requestBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return true;

    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          console.warn("⚠️ All BLE/Location permissions not granted");
          return false;
        }
        return allGranted;
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn("BLE Permission error:", err);
      return false;
    }
  }

  async saveConnectedDevice(
    device: Device | null,
    scheduleId: number | null
  ): Promise<void> {
    try {
      if (device && scheduleId !== null) {
        const deviceData: StoredDevice = {
          id: device.id,
          name: device.name,
          manufacturerData: device.manufacturerData,
        };
        await AsyncStorage.setItem(
          BLE_STORAGE_KEYS.CONNECTED_DEVICE,
          JSON.stringify(deviceData)
        );
        await AsyncStorage.setItem(
          BLE_STORAGE_KEYS.SCHEDULE_ID,
          scheduleId.toString()
        );
        this.connectedDevice = device;
      } else {
        await AsyncStorage.removeItem(BLE_STORAGE_KEYS.CONNECTED_DEVICE);
        await AsyncStorage.removeItem(BLE_STORAGE_KEYS.SCHEDULE_ID);
        this.connectedDevice = null;
      }
    } catch (error) {
      console.error("Error saving connected device:", error);
      throw error;
    }
  }

  async loadConnectedDevice(scheduleId: number): Promise<StoredDevice | null> {
    try {
      const storedDevice = await AsyncStorage.getItem(
        BLE_STORAGE_KEYS.CONNECTED_DEVICE
      );
      const storedScheduleId = await AsyncStorage.getItem(
        BLE_STORAGE_KEYS.SCHEDULE_ID
      );

      if (!storedDevice || storedScheduleId !== scheduleId.toString())
        return null;

      const deviceData: StoredDevice = JSON.parse(storedDevice);
      return deviceData;
    } catch (error) {
      console.error("Error loading connected device:", error);
      return null;
    }
  }

  async checkDeviceConnection(deviceId: string): Promise<boolean> {
    try {
      const connected = await bleManager.isDeviceConnected(deviceId);
      return connected;
    } catch (error) {
      console.error("Error checking device connection:", error);
      return false;
    }
  }

  isRoomPattern(text: string): boolean {
    return (
      text.includes("ComLab") || text.includes("Lab") || text.includes("Room")
    );
  }

  decodeBase64ManufacturerData(manufacturerData: string): string {
    try {
      let data = manufacturerData;
      while (data.length % 4 !== 0) {
        data += "=";
      }

      const buffer = Buffer.from(data, "base64");
      return buffer.toString("utf-8");
    } catch (error) {
      console.log("Base64 decoding error:", error);
      return manufacturerData;
    }
  }

  decodeManufacturerData(manufacturerData?: string | null): string {
    if (!manufacturerData) return "";
    try {
      const buffer = Buffer.from(manufacturerData, "base64");
      const decoded = buffer.toString("utf-8").trim();
      const cleaned = decoded.replace(/[^\x20-\x7E]/g, "").trim();
      return cleaned.length > 0 ? cleaned : manufacturerData;
    } catch {
      return manufacturerData;
    }
  }

  async startDeviceScan(options: BLEScanOptions = {}): Promise<void> {
    const {
      filterByManufacturer,
      serviceUUIDs,
      timeout = 20000,
      autoConnect = true,
      onDeviceFound,
      // ✅ Allow external override for background task
      scanMode = ScanMode.LowLatency, 
      allowDuplicates = true
    } = options;

    const hasPermission = await this.requestBluetoothPermissions();
    if (!hasPermission) {
      throw new Error("Bluetooth permissions are required.");
    }

    if ((!filterByManufacturer || filterByManufacturer.trim() === "") && (!serviceUUIDs || serviceUUIDs.length === 0)) {
      console.warn("⚠️ No filter provided, skipping scan.");
      return;
    }

    this.isScanning = true;
    this.seenDevices.clear();
    this.callbacks.onScanStarted?.();

    const filters = filterByManufacturer ? filterByManufacturer.split("|").map((f) => f.trim()) : [];

    bleManager.startDeviceScan(
      serviceUUIDs ?? null, 
      {
        scanMode: scanMode,
        allowDuplicates: allowDuplicates,
      },
      (error, device) => {
        if (error) {
          if (error.errorCode === 600 || error.message?.includes("cancelled")) {
            return;
          }

          this.stopDeviceScan();
          this.callbacks.onError?.(error);
          return;
        }

        if (device) {
          if (this.seenDevices.has(device.id)) return;
          this.seenDevices.add(device.id);

          this.callbacks.onDeviceFound?.(device);
          if (onDeviceFound) {
            onDeviceFound(device);
          }
          if (this.backgroundDeviceCallback) {
            this.backgroundDeviceCallback(device);
          }

          if (autoConnect) {
            const manufacturer = this.decodeManufacturerData(
              device.manufacturerData
            );
            if (manufacturer && filters.some((f) => manufacturer === f)) {
              this.checkDeviceConnection(device.id).then((isConnected) => {
                if (!isConnected) {
                  this.connectToDevice(device).catch((err) => {
                      if (err.errorCode !== 600) {
                        console.error("Auto-connect failed:", err);
                      }
                  });
                } else {
                  this.callbacks.onDeviceConnected?.(device);
                }
              });
            }
          }
        }
      }
    );

    if (timeout > 0) {
      if (this.scanTimeout) clearTimeout(this.scanTimeout);
      this.scanTimeout = setTimeout(() => {
        this.stopDeviceScan();
      }, timeout);
    }
  }

  stopDeviceScan(): void {
    if (this.isScanning) {
      bleManager.stopDeviceScan();
      this.isScanning = false;
      this.callbacks.onScanStopped?.();
    }

    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    if (this.rescanInterval) {
      clearInterval(this.rescanInterval);
      this.rescanInterval = null;
    }

    this.seenDevices.clear();
  }

  async connectToDevice(device: Device): Promise<Device> {
    try {
      const isAlreadyConnected = await this.checkDeviceConnection(device.id);
      if (isAlreadyConnected) {
        this.connectedDevice = device;
        this.callbacks.onDeviceConnected?.(device);
        return device;
      }

      const connected = await bleManager.connectToDevice(device.id, {
        autoConnect: false,
      });

      await connected.discoverAllServicesAndCharacteristics();

      const passwordSent = await this.sendPassword(device.id);
      if (!passwordSent) {
        await this.disconnectDevice(device.id);
        throw new Error("Password authentication failed");
      }

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 500);
      });

      this.connectedDevice = connected;
      this.callbacks.onDeviceConnected?.(connected);

      const storedScheduleId = await AsyncStorage.getItem(
        BLE_STORAGE_KEYS.SCHEDULE_ID
      );
      if (storedScheduleId) {
        await this.saveConnectedDevice(connected, parseInt(storedScheduleId));
      }

      this.stopDeviceScan();
      return connected;
    } catch (error: any) {
      if (error.errorCode === 600 || error.message?.includes("cancelled")) {
         return device; 
      }

      if (error.message?.includes("already connected")) {
        this.connectedDevice = device;
        this.callbacks.onDeviceConnected?.(device);
        return device;
      }
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  async writeToCharacteristic(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    value: string
  ): Promise<void> {
    try {
      const device = await bleManager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      const services = await device.services();
      const service = services.find(
        (s) => s.uuid.toLowerCase() === serviceUUID.toLowerCase()
      );
      if (!service) return;

      const characteristics = await service.characteristics();
      const characteristic = characteristics.find(
        (c) => c.uuid.toLowerCase() === characteristicUUID.toLowerCase()
      );
      if (!characteristic) return;

      const base64Value = Buffer.from(value, "utf-8").toString("base64");
      await characteristic.writeWithResponse(base64Value);
    } catch (error) {
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    try {
      await bleManager.cancelDeviceConnection(deviceId);
      this.callbacks.onDeviceDisconnected?.(deviceId);
    } catch (error: any) {
      if (
        !error.message?.includes("not connected") &&
        !error.message?.includes("Device is not connected")
      ) {
        this.callbacks.onError?.(error);
        throw error;
      }
    }
  }

  destroy(): void {
    this.stopDeviceScan();
    this.connectionSubscriptions.forEach((subscription) =>
      subscription.remove()
    );
    this.connectionSubscriptions.clear();
    this.connectedDevice = null;
    this.callbacks = {};
    this.backgroundDeviceCallback = null;
  }
}

export const bleUtils = new BLEUtils();