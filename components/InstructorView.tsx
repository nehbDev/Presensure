import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, Alert } from "react-native";
import { Device } from "react-native-ble-plx";
import { Ionicons } from "@expo/vector-icons";
import { stopInstructorTask } from "../utils/backgroundTask";

interface InstructorViewProps {
  isConnected: boolean;
  connectedDevice: Device | null;
  sessionStatus: string;
  scanning: boolean;
  handleDisconnect: () => void;
  onStartScan: () => void;
  isScheduleTime: boolean;
  timeUntilSchedule: string;
  isBluetoothOn?: boolean;
  activeSessionId: number | null;
  onCompleteSession: (sessionId: number) => Promise<void>;
  onCancelSession: (sessionId: number) => Promise<void>;
}

const InstructorView: React.FC<InstructorViewProps> = ({
  isConnected,
  connectedDevice,
  sessionStatus,
  scanning,
  handleDisconnect,
  onStartScan,
  isScheduleTime,
  timeUntilSchedule,
  isBluetoothOn = true,
  activeSessionId,
  onCompleteSession,
  onCancelSession,
}) => {
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDisconnectPress = () => {
    if (sessionStatus === "active" && activeSessionId) {
      setShowDisconnectModal(true);
    } else {
      handleDisconnect();
    }
  };

  const handleCompleteSession = async () => {
    if (!activeSessionId) return;

    setIsProcessing(true);
    try {
      await stopInstructorTask();
      await onCompleteSession(activeSessionId);
      setShowDisconnectModal(false);
      handleDisconnect();
    } catch (error) {
      Alert.alert("Error", "Failed to complete session");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelSession = async () => {
    if (!activeSessionId) return;

    setIsProcessing(true);
    try {
      await stopInstructorTask();
      await onCancelSession(activeSessionId);
      setShowDisconnectModal(false);
      handleDisconnect();
    } catch (error) {
      Alert.alert("Error", "Failed to cancel session");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseModal = () => {
    if (!isProcessing) {
      setShowDisconnectModal(false);
    }
  };

  // Show Bluetooth off state
  if (!isBluetoothOn) {
    return (
      <View className="mx-4 mb-4 p-4 rounded-2xl bg-red-50 border border-red-200">
        <View className="flex-row items-center">
          <View className="bg-red-100 p-2 rounded-full mr-3">
            <Ionicons name="bluetooth" size={20} color="#dc2626" />
          </View>
          <View className="flex-1">
            <Text className="text-red-800 font-semibold">
              Bluetooth is Turned Off
            </Text>
            <Text className="text-red-600 text-sm mt-1">
              Please enable Bluetooth to scan for devices and start attendance
              sessions
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Show connected state
  if (isConnected) {
    return (
      <>
        <View className="mx-4 mb-4 p-4 rounded-2xl bg-green-50 border border-green-200">
          <View className="flex-row items-center mb-2">
            <View className="bg-green-100 p-2 rounded-full mr-3">
              <Ionicons name="bluetooth" size={20} color="#059669" />
            </View>
            <View className="flex-1">
              <Text className="text-green-800 font-semibold">
                Connected to {connectedDevice?.name || connectedDevice?.id}
              </Text>
              <Text className="text-green-600 text-sm mt-1">
                Attendance session is{" "}
                {sessionStatus === "active" ? "active" : "ready"}
              </Text>
              {activeSessionId && (
                <Text className="text-green-600 text-xs mt-1">
                  Session ID: {activeSessionId}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleDisconnectPress}
            disabled={isProcessing}
            className={`mt-3 py-2 px-4 rounded-lg flex-row items-center justify-center self-start ${
              isProcessing ? "bg-gray-400" : "bg-red-500"
            }`}
          >
            <Ionicons name="close-circle" size={16} color="white" />
            <Text className="text-white ml-2 font-medium">
              {isProcessing ? "Processing..." : "Disconnect"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Disconnect Confirmation Modal */}
        <Modal
          visible={showDisconnectModal}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCloseModal}
        >
          <View className="flex-1 justify-center items-center">
            <View className="bg-white rounded-2xl p-6 mx-4 w-11/12 max-w-md  border-2 border-blue-600">
              <View className="flex-row items-center m-3">
                <View className="bg-blue-100 p-2 rounded-full mr-3">
                  <Ionicons
                    name="information-circle"
                    size={24}
                    color="#3b82f6"
                  />
                </View>
                <Text className="text-gray-600">
                  How would you like to end this attendance session?
                </Text>
              </View>

              <View className="space-y-3">
                <TouchableOpacity
                  onPress={handleCompleteSession}
                  disabled={isProcessing}
                  className={`flex-row items-center p-4 rounded-xl border mb-2 ${
                    isProcessing
                      ? "bg-gray-100 border-gray-300"
                      : "bg-green-50 border-green-200"
                  }`}
                >
                  <View
                    className={`p-2 rounded-full mr-3 ${
                      isProcessing ? "bg-gray-200" : "bg-green-100"
                    }`}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={isProcessing ? "#9ca3af" : "#059669"}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`font-semibold ${
                        isProcessing ? "text-gray-500" : "text-green-800"
                      }`}
                    >
                      Complete Session
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCancelSession}
                  disabled={isProcessing}
                  className={`flex-row items-center p-4 rounded-xl border ${
                    isProcessing
                      ? "bg-gray-100 border-gray-300"
                      : "bg-yellow-50 border-yellow-200"
                  }`}
                >
                  <View
                    className={`p-2 rounded-full mr-3 ${
                      isProcessing ? "bg-gray-200" : "bg-yellow-100"
                    }`}
                  >
                    <Ionicons
                      name="close-circle"
                      size={20}
                      color={isProcessing ? "#9ca3af" : "#d97706"}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`font-semibold ${
                        isProcessing ? "text-gray-500" : "text-yellow-800"
                      }`}
                    >
                      Cancel Session
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {!isProcessing && (
                <TouchableOpacity
                  onPress={handleCloseModal}
                  className="mt-6 py-3 rounded-lg bg-gray-100"
                >
                  <Text className="text-gray-700 text-center font-medium">
                    Continue Session
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // Show scan state (Bluetooth is on but not connected)
  return (
    <View className="mx-4 mb-4">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-bold text-gray-900">Nearby Devices</Text>

        {scanning && (
          <View className="flex-row items-center">
            <View className="h-2 w-2 bg-blue-500 rounded-full mr-1 animate-pulse" />
            <Text className="text-blue-500 text-sm">Scanning</Text>
          </View>
        )}
      </View>

      {!isBluetoothOn ? (
        <View className="py-3 px-6 rounded-lg bg-gray-100 border border-gray-300">
          <Text className="text-gray-500 text-center font-medium">
            Bluetooth Required for Scanning
          </Text>
        </View>
      ) : (
        <>
          {!scanning && (
            <TouchableOpacity
              onPress={onStartScan}
              disabled={!isScheduleTime}
              className={`py-3 px-6 rounded-lg flex-row items-center justify-center self-start ${
                isScheduleTime ? "bg-blue-500" : "bg-gray-400"
              }`}
            >
              <Ionicons name="bluetooth" size={18} color="white" />
              <Text className="text-white ml-2 font-medium text-base">
                {isScheduleTime ? "Scan for Devices" : "Scanning Disabled"}
              </Text>
            </TouchableOpacity>
          )}

          {!isScheduleTime && (
            <Text className="text-gray-500 text-sm mt-2">
              Scanning only available during class hours
            </Text>
          )}
        </>
      )}
    </View>
  );
};

export default InstructorView;