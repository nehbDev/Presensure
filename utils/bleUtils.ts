import {
  BleManager,
  Device,
  Subscription,
  State,
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
  timeout?: number;
  autoConnect?: boolean;
  onDeviceFound?: (device: Device) => void; // Added for background scanning
}

export interface BLECallbacks {
  onDeviceFound?: (device: Device) => void;
  onDeviceConnected?: (device: Device) => void;
  onDeviceDisconnected?: (deviceId: string) => void;
  onError?: (error: any) => void;
  onScanStarted?: () => void;
  onScanStopped?: () => void;
}

// Interface for stored device data
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

  // ✅ Added: check Bluetooth adapter state
 async getBluetoothState(): Promise<State> {
  return new Promise((resolve, reject) => {
    const subscription = bleManager.onStateChange((state) => {
      subscription.remove();
      resolve(state);
    }, true);
    
    // Fallback: get current state
    bleManager.state()
      .then(resolve)
      .catch(reject);
  });
}
  // Set callbacks
  setCallbacks(callbacks: BLECallbacks): void {
    this.callbacks = callbacks;
  }

  // Set background device callback for background scanning
  setBackgroundDeviceCallback(callback: (device: Device) => void): void {
    this.backgroundDeviceCallback = callback;
  }

  // Clear background device callback
  clearBackgroundDeviceCallback(): void {
    this.backgroundDeviceCallback = null;
  }

  // Set user role
  setUserRole(role: "instructor" | "student"): void {
    this.userRole = role;
  }

  // Request Bluetooth permissions
  async requestBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return true;

    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return Object.values(granted).every(
          (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
        );
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

  // Save connected device to storage
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

  // Load connected device from storage
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

  // Check if device is still connected
  async checkDeviceConnection(deviceId: string): Promise<boolean> {
    try {
      const connected = await bleManager.isDeviceConnected(deviceId);
      return connected;
    } catch (error) {
      console.error("Error checking device connection:", error);
      return false;
    }
  }

  // Check if text contains room patterns
  isRoomPattern(text: string): boolean {
    return (
      text.includes("ComLab") || text.includes("Lab") || text.includes("Room")
    );
  }

  // Simple base64 decoding function
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

  // Decode manufacturer data (with fallbacks)
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

  // Start device scan
  async startDeviceScan(options: BLEScanOptions = {}): Promise<void> {
    const {
      filterByManufacturer,
      timeout = 20000,
      autoConnect = true,
      onDeviceFound, // For background scanning
    } = options;

    const hasPermission = await this.requestBluetoothPermissions();
    if (!hasPermission) {
      throw new Error("Bluetooth permissions are required.");
    }

    if (!filterByManufacturer || filterByManufacturer.trim() === "") {
      console.warn("⚠️ No filter provided, skipping scan.");
      return;
    }

    this.isScanning = true;
    this.seenDevices.clear();
    this.callbacks.onScanStarted?.();

    const filters = filterByManufacturer.split("|").map((f) => f.trim());

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        this.stopDeviceScan();
        this.callbacks.onError?.(error);
        return;
      }

      if (device) {
        if (this.seenDevices.has(device.id)) return;
        this.seenDevices.add(device.id);

        // Call both regular callback and background callback
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
                  console.error("Auto-connect failed:", err);
                });
              } else {
                this.callbacks.onDeviceConnected?.(device);
              }
            });
          }
        }
      }
    });

    if (timeout > 0) {
      if (this.scanTimeout) clearTimeout(this.scanTimeout);
      this.scanTimeout = setTimeout(() => {
        this.stopDeviceScan();
      }, timeout);

      if (this.rescanInterval) clearInterval(this.rescanInterval);
      this.rescanInterval = setInterval(() => {
        if (!this.isScanning) return;
        this.stopDeviceScan();
        this.startDeviceScan(options);
      }, timeout * 2);
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

  // Connect to device
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
      if (error.message?.includes("already connected")) {
        this.connectedDevice = device;
        this.callbacks.onDeviceConnected?.(device);
        return device;
      }
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  // Write data to a characteristic
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

  // Disconnect device
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

  // Clean up resources
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