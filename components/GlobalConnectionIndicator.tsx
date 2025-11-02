// components/GlobalConnectionIndicator.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, AppState } from 'react-native';
import { useBLEConnection } from '../contexts/BLEConnectionContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isStudentTaskRunning, getCurrentStudentTask } from '../utils/backgroundTask';

const GlobalConnectionIndicator: React.FC = () => {
  const { isConnected } = useBLEConnection();
  const [userRole, setUserRole] = useState<'instructor' | 'student' | null>(null);
  const [studentBackgroundActive, setStudentBackgroundActive] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    loadUserData();
    checkStudentBackgroundTask();

    const appStateSub = AppState.addEventListener('change', state => {
      setAppState(state);
      if (state === 'active') checkStudentBackgroundTask();
    });

    const interval = setInterval(() => checkStudentBackgroundTask(), 10000);
    return () => {
      appStateSub.remove();
      clearInterval(interval);
    };
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        setUserRole(parsed.role);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  };

  const checkStudentBackgroundTask = async () => {
    try {
      const isRunning = await isStudentTaskRunning();
      setStudentBackgroundActive(isRunning);
    } catch (err) {
      console.error('Error checking background task:', err);
    }
  };

  // ⛔ Don’t render anything if no role
  if (!userRole) return null;

  // Student: hide if not active
  if (userRole === 'student' && !studentBackgroundActive) return null;

  // Instructor: hide if not connected
  if (userRole === 'instructor' && !isConnected) return null;

  // ✅ Simple indicator logic
  const isInstructor = userRole === 'instructor';
  const bgColor = isInstructor
    ? 'bg-green-500'
    : appState === 'background'
    ? 'bg-purple-500'
    : 'bg-blue-500';
  const icon = isInstructor ? '🟢' : appState === 'background' ? '📱' : '🎓';
  const text = isInstructor ? 'Started' : 'Tracking';

  return (
    <View className="absolute top-10 right-4 z-50">
      <View className={`${bgColor} px-3 py-2 rounded-full shadow-lg flex-row items-center`}>
        <View className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
        <Text className="text-white text-xs font-semibold">
          {icon} {text}
        </Text>
      </View>
    </View>
  );
};

export default GlobalConnectionIndicator;
