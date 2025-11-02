import React from 'react';
import { View, Text } from 'react-native';
import { useBLEConnection } from '../contexts/BLEConnectionContext';

const InstructorConnectionIndicator: React.FC = () => {
  const { isConnected, connectedDevice } = useBLEConnection();

  // Don't show if not connected
  if (!isConnected) return null;

  return (
    <View className="absolute top-10 right-4 z-50">
      <View className="bg-green-500 px-3 py-2 rounded-full shadow-lg flex-row items-center">
        <View className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
        <Text className="text-white text-xs font-semibold">
          Started
        </Text>
      </View>
    </View>
  );
};

export default InstructorConnectionIndicator;