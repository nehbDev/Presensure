import React, { useEffect, useRef } from "react";
import { View, Animated, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

const ViewScheduleSkeleton = () => {
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
    <View className="flex-1 bg-gray-50 px-4 pt-4">
      {/* 1. Header Card Skeleton (Subject Info) */}
      <Animated.View
        style={{ opacity }}
        className="bg-white p-6 rounded-3xl shadow-sm mb-4"
      >
        {/* Title Line */}
        <View className="h-6 w-3/4 bg-gray-200 rounded mb-4" />
        
        {/* Time Row */}
        <View className="flex-row items-center mb-3">
          <View className="w-4 h-4 bg-gray-200 rounded-full mr-2" />
          <View className="h-4 w-1/2 bg-gray-200 rounded" />
        </View>

        {/* Room Row */}
        <View className="flex-row items-center">
          <View className="w-4 h-4 bg-gray-200 rounded-full mr-2" />
          <View className="h-4 w-1/3 bg-gray-200 rounded" />
        </View>
      </Animated.View>

      {/* 2. Action Card Skeleton (Instructor/Student View) */}
      <Animated.View
        style={{ opacity }}
        className="bg-white p-6 rounded-2xl shadow-sm mb-4 border border-gray-100"
      >
        <View className="h-4 w-1/3 bg-gray-200 rounded mb-4" />
        <View className="h-10 w-full bg-gray-200 rounded-xl" />
      </Animated.View>

      {/* 3. List Items Skeleton (Simulating scanned devices) */}
      {[1, 2, 3].map((item) => (
        <Animated.View
          key={item}
          style={{ opacity }}
          className="p-5 rounded-2xl bg-white border border-gray-100 mb-3"
        >
          <View className="flex-row items-center">
            <View className="w-10 h-10 bg-gray-200 rounded-full mr-3" />
            <View className="flex-1">
              <View className="h-4 w-1/2 bg-gray-200 rounded mb-2" />
              <View className="h-3 w-1/3 bg-gray-200 rounded" />
            </View>
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

export default ViewScheduleSkeleton;