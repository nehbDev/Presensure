import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bleManager, bleUtils } from './bleUtils';
import { Device } from 'react-native-ble-plx'; // ✅ Add this import

let backgroundScanRunning = false;
let backgroundScanInterval: NodeJS.Timeout | null = null;

// ✅ Improved notification function
// ✅ Improved notification function without deprecated properties
const sendNotification = async (subjectCode: string, isTest = false) => {
  try {
    console.log('📢 Attempting to send notification for:', subjectCode);
    
    const title = isTest ? '🔔 Test Notification' : '🎯 Attendance Recorded';
    const body = isTest 
      ? 'Test notification from BLE scanner' 
      : `Your attendance for ${subjectCode} has been recorded via BLE`;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
        // ✅ Remove autoDismiss as it might prevent notifications from showing
        data: { 
          type: isTest ? 'test' : 'attendance', 
          subject: subjectCode,
          timestamp: new Date().toISOString()
        },
      },
      trigger: null,
    });

    console.log('✅ Notification scheduled with ID:', notificationId);
    
    // ✅ Also present immediately for better visibility
    if (Platform.OS === 'ios') {
      await Notifications.presentNotificationAsync({
        title,
        body,
        sound: true,
      });
    }
    
    return notificationId;

  } catch (error) {
    console.error('❌ Failed to send notification:', error);
    throw error;
  }
};

// ✅ Test notification function
export const testNotification = async (subjectCode: string = 'TEST123'): Promise<void> => {
  try {
    await sendNotification(subjectCode, true);
    console.log('✅ Test notification sent successfully');
  } catch (error) {
    console.error('❌ Test notification failed:', error);
    throw error;
  }
};

export const startBackgroundScan = async (subjectCode: string, scheduleId: number): Promise<void> => {
  try {
    console.log('🚀 Starting background scan for:', subjectCode);
    
    // Save data for background scanning
    await AsyncStorage.setItem('ble_current_schedule_id', scheduleId.toString());
    await AsyncStorage.setItem('ble_current_subject_code', subjectCode);
    await AsyncStorage.setItem('ble_user_role', 'student');

    // Stop any existing scan
    await stopBackgroundScan();

    // Request permissions
    await bleUtils.requestBluetoothPermissions();

    backgroundScanRunning = true;
    
    // ✅ Send a startup notification
    await sendNotification(`Background scanning started for ${subjectCode}`);
    
    // Start periodic scanning
    backgroundScanInterval = setInterval(async () => {
      if (!backgroundScanRunning) return;

      console.log('🔄 Background BLE scan running...');
      
      try {
        let foundMatch = false;
        let scanDevices: Device[] = []; // ✅ Now Device is imported
        
        // Start a quick scan (15 seconds)
        bleManager.startDeviceScan(null, null, async (error, device) => {
          if (error) {
            console.error('BLE scan error:', error);
            bleManager.stopDeviceScan();
            return;
          }

          if (device) {
            // Add to devices list for logging
            if (!scanDevices.find(d => d.id === device.id)) {
              scanDevices.push(device);
            }

            if (device.manufacturerData) {
              const manufacturer = bleUtils.decodeManufacturerData(device.manufacturerData);
              console.log('🔍 Found device with manufacturer:', manufacturer);
              
              if (manufacturer === subjectCode) {
                foundMatch = true;
                bleManager.stopDeviceScan();
                
                console.log('✅ Match found! Sending notification...');
                await sendNotification(subjectCode);
                
                // Also send a local alert for immediate feedback
                if (Platform.OS === 'ios') {
                  await Notifications.presentNotificationAsync({
                    title: '✅ Attendance Recorded',
                    body: `Subject: ${subjectCode}`,
                    sound: true,
                  });
                }
              }
            }
          }
        });

        // Stop scan after 15 seconds
        setTimeout(() => {
          bleManager.stopDeviceScan();
          console.log(`⏹️ Scan completed. Found ${scanDevices.length} devices.`);
          
          if (!foundMatch) {
            console.log('No matching devices found this cycle');
          }
        }, 15000);

      } catch (error) {
        console.error('Background scan error:', error);
      }
    }, 300000); // Scan every 5 minutes

    console.log('✅ Background scan started for:', subjectCode);

  } catch (error) {
    console.error('Failed to start background scan:', error);
    throw error;
  }
};

// Stop background scan
export const stopBackgroundScan = async (): Promise<void> => {
  try {
    backgroundScanRunning = false;
    
    if (backgroundScanInterval) {
      clearInterval(backgroundScanInterval);
      backgroundScanInterval = null;
    }
    
    bleManager.stopDeviceScan();
    
    // Clear storage
    await AsyncStorage.multiRemove([
      'ble_current_schedule_id',
      'ble_current_subject_code'
    ]);
    
    console.log('🛑 Background scan stopped');
    
    // Send a stop notification
    await sendNotification('Background scanning stopped');
    
  } catch (error) {
    console.error('Failed to stop background scan:', error);
    throw error;
  }
};

// Check if background scan is running
export const isBackgroundScanRunning = (): boolean => {
  return backgroundScanRunning;
};

// Get background scan status
export const getBackgroundScanStatus = async (): Promise<{
  isRunning: boolean;
  subjectCode?: string;
  scheduleId?: string;
}> => {
  try {
    const subjectCode = await AsyncStorage.getItem('ble_current_subject_code');
    const scheduleId = await AsyncStorage.getItem('ble_current_schedule_id');
    
    return {
      isRunning: backgroundScanRunning,
      subjectCode: subjectCode || undefined,
      scheduleId: scheduleId || undefined
    };
  } catch (error) {
    console.error('Error getting background scan status:', error);
    return { isRunning: false };
  }
};