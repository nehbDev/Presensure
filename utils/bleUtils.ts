// utils/bleUtils.ts
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { PermissionsAndroid, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const bleManager = new BleManager();
export const BLE_STORAGE_KEYS = {
  CONNECTED_DEVICE: 'ble_connected_device',
  SCHEDULE_ID: 'ble_current_schedule_id',
  USER_ROLE: 'ble_user_role',
};

export interface BLEScanOptions {
  filterByManufacturer?: string;
  timeout?: number;
  autoConnect?: boolean;
}

export interface BLECallbacks {
  onDeviceFound?: (device: Device) => void;
  onDeviceConnected?: (device: Device) => void;
  onDeviceDisconnected?: (deviceId: string) => void;
  onError?: (error: any) => void;
  onScanStarted?: () => void;
  onScanStopped?: () => void;
}

class BLEUtils {
  private isScanning = false;
  private connectedDevice: Device | null = null;
  private callbacks: BLECallbacks = {};
  private scanTimeout: NodeJS.Timeout | null = null;
  private userRole: 'instructor' | 'student' | null = null;
  private connectionSubscriptions: Map<string, Subscription> = new Map();

  // Set callbacks
  setCallbacks(callbacks: BLECallbacks): void {
    this.callbacks = callbacks;
  }

  // Set user role
  setUserRole(role: 'instructor' | 'student'): void {
    this.userRole = role;
  }

  // Request Bluetooth permissions
  async requestBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn('BLE Permission error:', err);
      return false;
    }
  }

  // Save connected device to storage
  async saveConnectedDevice(device: Device | null, scheduleId: number): Promise<void> {
    try {
      if (device) {
        const deviceData = {
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
      console.error('Error saving connected device:', error);
      throw error;
    }
  }

  // Load connected device from storage
  async loadConnectedDevice(scheduleId: number): Promise<Device | null> {
    try {
      const storedDevice = await AsyncStorage.getItem(BLE_STORAGE_KEYS.CONNECTED_DEVICE);
      const storedScheduleId = await AsyncStorage.getItem(BLE_STORAGE_KEYS.SCHEDULE_ID);

      if (!storedDevice || storedScheduleId !== scheduleId.toString()) return null;

      const deviceData = JSON.parse(storedDevice);
      return deviceData as Device;
    } catch (error) {
      console.error('Error loading connected device:', error);
      return null;
    }
  }

  // Check if device is still connected
  async checkDeviceConnection(deviceId: string): Promise<boolean> {
    try {
      const connectedDevices = await bleManager.connectedDevices([]);
      return connectedDevices.some(device => device.id === deviceId);
    } catch (error) {
      console.error('Error checking device connection:', error);
      return false;
    }
  }

  // Check if text contains room patterns
  isRoomPattern(text: string): boolean {
    return text.includes('ComLab') || text.includes('Lab') || text.includes('Room');
  }

  // Simple base64 decoding function
  decodeBase64ManufacturerData(manufacturerData: string): string {
    try {
      // Remove any padding if needed
      let data = manufacturerData;
      while (data.length % 4 !== 0) {
        data += '=';
      }
      
      const buffer = Buffer.from(data, 'base64');
      return buffer.toString('utf-8');
    } catch (error) {
      console.log("Base64 decoding error:", error);
      return manufacturerData;
    }
  }

  // Test base64 decoding
  testBase64Decoding(): void {
    const testData = "Q29tTGFiIC0gQg==";
    const decoded = this.decodeBase64ManufacturerData(testData);
    console.log("TEST: Base64 decoding of", testData, "=", decoded);
  }

  // Decode manufacturer data
  // In bleUtils.ts - Update the decodeManufacturerData method
decodeManufacturerData(manufacturerData?: string | null): string {
  if (!manufacturerData) return '';
  console.log("🔍 Raw manufacturer data:", manufacturerData);
  
  try {
    // Try base64 decoding (React Native BLE library encodes as base64)
    try {
      const buffer = Buffer.from(manufacturerData, 'base64');
      const decoded = buffer.toString('utf-8').trim();
      console.log("🔍 Base64 decoded:", decoded);
      
      // Check if this looks like a valid subject code
      if (decoded && decoded.length > 0 && !decoded.includes('�')) {
        return decoded;
      }
    } catch (base64Error) {
      console.log("🔍 Base64 decoding failed");
    }
    
    // If base64 decoding failed, try direct string
    console.log("🔍 Using raw manufacturer data as subject code");
    return manufacturerData;
    
  } catch (error) {
    console.log("🔍 Decoding failed, returning raw data:", error);
    return manufacturerData || '';
  }
}

  // Start device scan
  async startDeviceScan(options: BLEScanOptions = {}): Promise<void> {
    const { filterByManufacturer, timeout = 10000, autoConnect = true } = options;

    const hasPermission = await this.requestBluetoothPermissions();
    if (!hasPermission) {
      throw new Error('Bluetooth permissions are required.');
    }

    this.isScanning = true;
    this.callbacks.onScanStarted?.();

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        this.stopDeviceScan();
        this.callbacks.onError?.(error);
        return;
      }

      if (device) {
        this.callbacks.onDeviceFound?.(device);

        // Auto-connect if manufacturer matches and autoConnect is enabled
        if (autoConnect && filterByManufacturer) {
          const manufacturer = this.decodeManufacturerData(device.manufacturerData);
          if (manufacturer && manufacturer.trim() === filterByManufacturer.trim()) {
            this.connectToDevice(device).catch(err => {
              console.error('Auto-connect failed:', err);
            });
          }
        }
      }
    });

    // Set timeout to stop scan
    if (timeout > 0) {
      this.scanTimeout = setTimeout(() => this.stopDeviceScan(), timeout);
    }
  }

  // Stop device scan
  stopDeviceScan(): void {
    if (this.isScanning) {
      bleManager.stopDeviceScan();
      this.isScanning = false;
      if (this.scanTimeout) {
        clearTimeout(this.scanTimeout);
        this.scanTimeout = null;
      }
      this.callbacks.onScanStopped?.();
    }
  }

  // Connect to device
  async connectToDevice(device: Device): Promise<Device> {
    this.stopDeviceScan();
    
    try {
      const connected = await bleManager.connectToDevice(device.id, {
        autoConnect: true,
      });
      
      // Discover services and characteristics immediately after connection
      await connected.discoverAllServicesAndCharacteristics();
      
      this.connectedDevice = connected;
      this.callbacks.onDeviceConnected?.(connected);
      
      return connected;
    } catch (error) {
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
    const service = services.find(s => s.uuid.toLowerCase() === serviceUUID.toLowerCase());

    if (service) {
      const characteristics = await service.characteristics();
      const characteristic = characteristics.find(
        c => c.uuid.toLowerCase() === characteristicUUID.toLowerCase()
      );

      if (characteristic) {
        // Convert string -> Base64
        const base64Value = Buffer.from(value, "utf-8").toString("base64");

        await characteristic.writeWithResponse(base64Value);
        console.log("✅ Successfully wrote to characteristic:", value, "(Base64:", base64Value, ")");
      } else {
        throw new Error("Characteristic not found");
      }
    } else {
      throw new Error("Service not found");
    }
  } catch (error) {
    console.error("❌ Error writing to characteristic:", error);
    throw error;
  }
}
  // Disconnect device
  async disconnectDevice(deviceId: string): Promise<void> {
    try {
      await bleManager.cancelDeviceConnection(deviceId);
      this.callbacks.onDeviceDisconnected?.(deviceId);
    } catch (error) {
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  // Clean up resources
  destroy(): void {
    this.stopDeviceScan();
    this.connectionSubscriptions.forEach(subscription => subscription.remove());
    this.connectionSubscriptions.clear();
    this.connectedDevice = null;
    this.callbacks = {};
  }
}

export const bleUtils = new BLEUtils();