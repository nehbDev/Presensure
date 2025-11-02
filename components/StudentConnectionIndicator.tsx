import React, { useEffect, useState } from 'react';
import { View, Text, AppState } from 'react-native';
import { isStudentTaskRunning, getCurrentStudentTask } from '../utils/backgroundTask';

const StudentConnectionIndicator: React.FC = () => {
  const [studentBackgroundActive, setStudentBackgroundActive] = useState(false);
  const [currentTask, setCurrentTask] = useState<any>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const [timeUntilNextScan, setTimeUntilNextScan] = useState<string>('');

  useEffect(() => {
    checkStudentBackgroundTask();
    
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      setAppState(nextAppState);
      if (nextAppState === 'active') {
        checkStudentBackgroundTask();
      }
    });

    const interval = setInterval(() => {
      checkStudentBackgroundTask();
      updateTimingDisplay();
    }, 10000);
    
    return () => {
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, []);

  const checkStudentBackgroundTask = async () => {
    try {
      const isRunning = await isStudentTaskRunning();
      const task = await getCurrentStudentTask();
      
      setStudentBackgroundActive(isRunning);
      setCurrentTask(task);
    } catch (error) {
      console.error("Error checking background task:", error);
    }
  };

  const updateTimingDisplay = () => {
    if (currentTask && currentTask.nextScanTime) {
      const nextScan = new Date(currentTask.nextScanTime);
      const now = new Date();
      const diffMs = nextScan.getTime() - now.getTime();
      
      if (diffMs > 0) {
        const minutes = Math.floor(diffMs / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);
        setTimeUntilNextScan(`${minutes}m ${seconds.toString().padStart(2, '0')}s`);
      } else {
        setTimeUntilNextScan('Scanning now...');
      }
    } else if (studentBackgroundActive) {
      setTimeUntilNextScan('Every 2 minutes');
    } else {
      setTimeUntilNextScan('');
    }
  };

  // Don't show if no background task active
  if (!studentBackgroundActive) return null;

  return (
    <View className="absolute top-10 right-4 z-50">
      <View className="bg-blue-500 px-3 py-2 rounded-full shadow-lg flex-row items-center">
        <View className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
        <Text className="text-white text-xs font-semibold">
          Scaning
        </Text>
      </View>
    </View>
  );
};

export default StudentConnectionIndicator;