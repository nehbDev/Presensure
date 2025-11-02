import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Device } from 'react-native-ble-plx';
import { bleUtils, BLE_STORAGE_KEYS } from '../utils/bleUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAlertHandler } from "../components/useAlertHandler";

interface BLEConnectionContextType {
  isConnected: boolean;
  connectedDevice: Device | null;
  currentScheduleId: number | null;
  connectDevice: (device: Device, scheduleId: number) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  loadConnectionState: () => Promise<void>;
}

const BLEConnectionContext = createContext<BLEConnectionContextType | undefined>(undefined);

interface BLEConnectionProviderProps {
  children: ReactNode;
}

export const useBLEConnection = (): BLEConnectionContextType => {
  const context = useContext(BLEConnectionContext);
  if (!context) {
    throw new Error('useBLEConnection must be used within a BLEConnectionProvider');
  }
  return context;
};

// Create a minimal device interface for storage
interface StoredDevice {
  id: string;
  name: string | null;
  manufacturerData: string | null;
}

export const BLEConnectionProvider: React.FC<BLEConnectionProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [currentScheduleId, setCurrentScheduleId] = useState<number | null>(null);

  const { showAlert } = useAlertHandler();

  // Load connection state on app start
  useEffect(() => {
    loadConnectionState();
  }, []);

  const loadConnectionState = async (): Promise<void> => {
    try {
      const storedDevice = await AsyncStorage.getItem(BLE_STORAGE_KEYS.CONNECTED_DEVICE);
      const storedScheduleId = await AsyncStorage.getItem(BLE_STORAGE_KEYS.SCHEDULE_ID);
      
      if (storedDevice && storedScheduleId) {
        const deviceData: StoredDevice = JSON.parse(storedDevice);
        setCurrentScheduleId(parseInt(storedScheduleId));
        
        // Check if device is still connected
        const isStillConnected = await bleUtils.checkDeviceConnection(deviceData.id);
        setIsConnected(isStillConnected);
        
        if (isStillConnected) {
          console.log('✅ Device still connected:', deviceData.id);
          // We can't recreate the full Device object, but we can store the basic info
          setConnectedDevice({
            id: deviceData.id,
            name: deviceData.name,
            manufacturerData: deviceData.manufacturerData,
          } as Device);
        } else {
          console.log('⚠️ Device not connected anymore');
          await disconnectDevice();
        }
      }
    } catch (error) {
      console.error('Error loading connection state:', error);
    }
  };

  const connectDevice = async (device: Device, scheduleId: number): Promise<void> => {
    try {
      // Store only the essential device data
      const deviceData: StoredDevice = {
        id: device.id,
        name: device.name,
        manufacturerData: device.manufacturerData,
      };
      
      await AsyncStorage.setItem(BLE_STORAGE_KEYS.CONNECTED_DEVICE, JSON.stringify(deviceData));
      await AsyncStorage.setItem(BLE_STORAGE_KEYS.SCHEDULE_ID, scheduleId.toString());
      
      setConnectedDevice(device);
      setCurrentScheduleId(scheduleId);
      setIsConnected(true);
    } catch (error) {
      console.error('Error connecting device:', error);
      throw error;
    }
  };

  const disconnectDevice = async (): Promise<void> => {
    try {
      if (connectedDevice) {
        try {
          await bleUtils.disconnectDevice(connectedDevice.id);
        } catch (error) {
          console.log('Disconnect error (may be expected):', error);
        }
      }
      await AsyncStorage.removeItem(BLE_STORAGE_KEYS.CONNECTED_DEVICE);
      await AsyncStorage.removeItem(BLE_STORAGE_KEYS.SCHEDULE_ID);
      setConnectedDevice(null);
      setCurrentScheduleId(null);
      setIsConnected(false);
    } catch (error) {
      console.error('Error disconnecting device:', error);
    }
  };

  const value: BLEConnectionContextType = {
    isConnected,
    connectedDevice,
    currentScheduleId,
    connectDevice,
    disconnectDevice,
    loadConnectionState,
  };

  return (
    <BLEConnectionContext.Provider value={value}>
      {children}
    </BLEConnectionContext.Provider>
  );
};