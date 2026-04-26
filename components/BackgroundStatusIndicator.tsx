import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { isBackgroundScanRunning, stopBackgroundScan, getBackgroundScanStatus, testNotification } from '../utils/backgroundService';

const BackgroundStatusIndicator: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [subjectCode, setSubjectCode] = useState<string>('');

  useEffect(() => {
    const checkStatus = async () => {
      const running = isBackgroundScanRunning();
      setIsRunning(running);
      
      if (running) {
        const status = await getBackgroundScanStatus();
        setSubjectCode(status.subjectCode || '');
        setScanCount(prev => prev + 1);
      } else {
        setSubjectCode('');
        setScanCount(0);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleStop = async () => {
    await stopBackgroundScan();
    setIsRunning(false);
    setScanCount(0);
    setSubjectCode('');
    Alert.alert('Background Scan Stopped', 'BLE background scanning has been disabled.');
  };

  const handleTestNotification = async () => {
    try {
      await testNotification(subjectCode || 'TEST123');
      Alert.alert('Test Sent', 'Test notification sent to status bar');
    } catch (error) {
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  if (!isRunning) return null;

  return (
    <View className="absolute top-10 right-2 bg-blue-500 px-3 py-2 rounded-lg shadow-lg z-50">
      <TouchableOpacity onPress={handleStop}>
        <Text className="text-white text-xs font-bold">
          📱 Background Scan Active
        </Text>
        {subjectCode && (
          <Text className="text-white text-xs">
            Subject: {subjectCode}
          </Text>
        )}
        <Text className="text-white text-xs">
          Scans: {scanCount}
        </Text>
        <Text className="text-white text-xs italic">
          Tap to stop
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity onPress={handleTestNotification} className="mt-1">
        <Text className="text-white text-xs italic underline">
          Test Notif
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default BackgroundStatusIndicator;