import React, { useEffect, useRef } from "react";
import { View, Animated } from "react-native";

interface SkeletonProps {
  width: number;
}

const ScheduleSkeleton = ({ width }: SkeletonProps) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    
    animation.start();

    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={{
        opacity,
        width: width,
        marginBottom: 16,
        height: 140, // Match minHeight of your real card
      }}
      className="bg-white rounded-2xl p-5 shadow-lg flex justify-between"
    >
      {/* Header: Icon + Title */}
      <View className="flex-row items-center mb-2">
        <View className="bg-gray-200 rounded-full w-10 h-10 mr-2" />
        <View className="bg-gray-200 h-6 rounded flex-1" />
      </View>

      {/* Middle: Days/Room */}
      <View className="bg-gray-200 h-4 w-3/4 rounded mb-2" />

      {/* Bottom: Time + Badge */}
      <View className="flex-row justify-between items-center mt-2">
        <View className="bg-gray-200 h-5 w-1/3 rounded" />
        <View className="bg-gray-200 h-6 w-16 rounded-full" />
      </View>
    </Animated.View>
  );
};

export default ScheduleSkeleton;