import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useBLEConnection } from '../contexts/BLEConnectionContext';

const InstructorConnectionIndicator: React.FC = () => {
  const { isConnected } = useBLEConnection();

  if (!isConnected) return null;

  return (
    <View
      className={`absolute right-4 ${
        Platform.OS === 'ios' ? 'top-[30px]' : 'top-[20px]'
      } justify-center`}
    >
      <View className="flex-row items-center bg-green-500 px-3 py-2 rounded-full shadow-lg">
        <View className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
        <Text className="text-white text-xs font-semibold">Started</Text>
      </View>
    </View>
  );
};

export default InstructorConnectionIndicator;
