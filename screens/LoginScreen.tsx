import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import API_URL from "../api/apiConfig";

export default function LoginScreen({ navigation }: any) {
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!studentId || !password) {
      Alert.alert("Error", "Please enter Student ID and Password");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ id: studentId, password }),
      });

      const data = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem("user", JSON.stringify(data.user));
        await AsyncStorage.setItem("token", data.token);
        navigation.replace("HomeScreen");
      } else {
        Alert.alert("Login Failed", data.message || "Invalid credentials");
      }
    } catch (error: any) {
      Alert.alert("Error", "Could not connect to server");
      console.error("Network Error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-900 justify-center px-6">
      {/* Card */}
      <View className="bg-white rounded-2xl shadow-2xl p-6 border border-gray-200">
        {/* Logo + Title */}
        <View className="items-center mb-6">
          <Image
            source={require("../assets/logo.webp")}
            className="h-20 w-20 mb-3"
            resizeMode="contain"
          />
          <Text className="text-xl font-bold text-gray-800">Welcome Back</Text>
        </View>

        {/* Student ID */}
        <View className="mb-4">
          <Text className="text-xs font-medium text-gray-700 mb-1">
            ID Number
          </Text>
          <View className="flex-row items-center border border-gray-300 rounded-lg px-3 py-2 bg-white">
            <Ionicons name="id-card-outline" size={18} color="gray" />
            <TextInput
              className="flex-1 ml-2 text-gray-900"
              placeholder="Enter your ID (e.g. C-2024-0001)"
              value={studentId}
              onChangeText={setStudentId}
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Password */}
        <View className="mb-6">
          <Text className="text-xs font-medium text-gray-700 mb-1">
            Password
          </Text>
          <View className="flex-row items-center border border-gray-300 rounded-lg px-3 py-2 bg-white">
            <Ionicons name="lock-closed-outline" size={18} color="gray" />
            <TextInput
              className="flex-1 ml-2 text-gray-900"
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={18}
                color="gray"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Login Button */}
        <Pressable
          onPress={handleLogin}
          disabled={loading}
          className="w-full bg-blue-600 py-3 rounded-lg"
        >
          {loading ? (
            <View className="flex-row justify-center items-center">
              <ActivityIndicator color="#fff" size="small" />
              <Text className="text-white font-semibold ml-2">
                Signing in...
              </Text>
            </View>
          ) : (
            <Text className="text-white font-semibold text-center">Sign In</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
