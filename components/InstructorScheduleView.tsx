import React from "react";
import { View, Text, Button } from "react-native";
import { Device } from "react-native-ble-plx";

export interface InstructorScheduleViewProps {
  connectedDevice: Device | null;
  sessionStatus: "active" | "inactive" | "unknown";
  disconnectDevice: () => Promise<void>;
  scanning: boolean;
  scheduleRoom: string;
}

export default function InstructorScheduleView({
  connectedDevice,
  sessionStatus,
  disconnectDevice,
  scanning,
  scheduleRoom,
}: InstructorScheduleViewProps) {
  return (
    <View className="mt-4 p-4 bg-gray-100 rounded-lg shadow">
      <Text className="text-lg font-semibold mb-2">Instructor View</Text>
      <Text className="text-sm mb-1">Session: {sessionStatus}</Text>

      {connectedDevice ? (
        <>
          <Text className="text-sm text-green-600 mb-1">
            ✅ Connected to: {connectedDevice.name || "Unknown"} (
            {connectedDevice.id})
          </Text>
          <Button title="Disconnect" onPress={disconnectDevice} />
        </>
      ) : (
        <Text className="text-sm text-red-500 mb-1">
          ❌ Not connected (waiting for ESP32 in room {scheduleRoom})
        </Text>
      )}

      <Text className="text-sm text-gray-500 mt-2">
        {scanning ? "🔍 Scanning..." : "⏸ Scan paused"}
      </Text>
    </View>
  );
}
