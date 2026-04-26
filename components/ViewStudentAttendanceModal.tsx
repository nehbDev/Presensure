import React from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";

const { height } = Dimensions.get("window");
// Import your local no-profile asset
const noProfile = require("../assets/noProfile.webp");

// --- Interfaces ---

interface AwayInterval {
  reason: string;
  start: string;
  end: string;
  duration_readable: string;
}

interface AwayAnalysis {
  total_away_readable: string;
  away_intervals: AwayInterval[];
}

export interface StudentRecord {
  attendance_record_id: number | null;
  student_id: string;
  student_name: string;
  lastname: string;
  sex: string;
  program: string;
  year_level: string;
  block: string;
  profile_image: string;
  final_status: string;
  time_in: string;
  time_out: string;
  minutes_late: number;
  proximity_status: string;
  first_rssi?: number;
  away_analysis: AwayAnalysis;
}

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  student: StudentRecord | null;
}

export default function ViewStudentAttendanceModal({ visible, onClose, student }: ModalProps) {
  if (!student) return null;

  // --- Helpers ---

  const formatTime = (input: string) => {
    if (!input || input === "--" || input === "--:--") return "--:--";
    if (input.includes("T") || input.includes("-")) {
      const date = new Date(input);
      if (isNaN(date.getTime())) return "--:--";
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
    const timePart = input.includes(" ") ? input.split(" ")[1] : input;
    const parts = timePart.split(":");
    if (parts.length < 2) return timePart;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "present": 
        return { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200", icon: "check-circle" };
      case "late": 
        return { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200", icon: "clock" };
      case "excused": 
        // ✅ Color Violet logic added
        return { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200", icon: "file-alt" };
      case "absent": 
        return { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200", icon: "times-circle" };
      default: 
        return { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200", icon: "question-circle" };
    }
  };

  const getProximityStyle = (status: string) => {
    if (status?.includes("Immediate")) return "bg-blue-50 border-blue-200";
    return "bg-white border-gray-200";
  };

  const renderReasonBadge = (reason: string) => {
    const baseStyle = "flex-row items-center px-2 py-1 rounded border self-start";
    const textStyle = "text-[9px] font-bold ml-1 uppercase";
    
    switch (reason) {
      case "LATE_ARRIVAL":
        return (
          <View className={`${baseStyle} bg-blue-50 border-blue-200`}>
            <FontAwesome5 name="clock" size={8} color="#1d4ed8" />
            <Text className={`${textStyle} text-blue-700`}>Late Arrival</Text>
          </View>
        );
      case "AWAY_MID_CLASS":
        return (
          <View className={`${baseStyle} bg-gray-100 border-gray-200`}>
             <FontAwesome5 name="walking" size={8} color="#4b5563" />
            <Text className={`${textStyle} text-gray-600`}>Left Room</Text>
          </View>
        );
      case "LEFT_EARLY":
        return (
          <View className={`${baseStyle} bg-gray-100 border-gray-200`}>
             <FontAwesome5 name="sign-out-alt" size={8} color="#4b5563" />
            <Text className={`${textStyle} text-gray-600`}>Left Early</Text>
          </View>
        );
      default:
        return (
          <View className={`${baseStyle} bg-gray-50 border-gray-200`}>
            <Text className={`${textStyle} text-gray-50`}>{reason}</Text>
          </View>
        );
    }
  };

  const statusStyle = getStatusColor(student.final_status);
  const isExcused = student.final_status?.toLowerCase() === "excused";

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View style={{ height: height * 0.85 }} className="bg-white rounded-t-3xl overflow-hidden">
          
          <View className="bg-white px-5 py-4 border-b border-gray-100 flex-row justify-between items-center">
            <Text className="text-lg font-bold text-gray-800">Attendance Details</Text>
            <TouchableOpacity onPress={onClose} className="bg-gray-100 p-2 rounded-full">
              <Ionicons name="close" size={20} color="#4B5563" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            
            {/* 1. Profile Section */}
            <View className="flex-row items-center justify-between mb-8">
               <View className="flex-row items-center flex-1">
                 {/* ✅ Check if profile_image exists, else use local noProfile */}
                 <Image 
                    source={student.profile_image ? { uri: student.profile_image } : noProfile} 
                    className="w-16 h-16 rounded-full border border-gray-200 bg-gray-100"
                  />
                  <View className="ml-4 flex-1">
                    <Text className="text-xl font-bold text-gray-900" numberOfLines={1}>
                        {student.lastname}, {(student.student_name || "").split(",")[1] || ""}
                    </Text>
                    <Text className="text-gray-500 text-xs font-medium mb-2">{student.student_id}</Text>
                    
                    {student.program !== "N/A" && (
                        <View className="bg-blue-50 self-start px-2 py-1 rounded border border-blue-100">
                            <Text className="text-[10px] font-bold text-blue-600 uppercase">
                                {student.program} {student.year_level}-{student.block}
                            </Text>
                        </View>
                    )}
                  </View>
               </View>

               <View className={`px-3 py-1.5 rounded-full border flex-row items-center ${statusStyle.bg} ${statusStyle.border}`}>
                  <FontAwesome5 name={statusStyle.icon} size={12} color={isExcused ? "#7e22ce" : undefined} className={statusStyle.text} />
                  <Text className={`ml-1.5 text-xs font-bold uppercase ${statusStyle.text}`}>{student.final_status}</Text>
               </View>
            </View>

            {/* 2. Stats Grid */}
            <View className="flex-row gap-3 mb-8">
                <View className="flex-1 bg-white p-3 rounded-xl border border-gray-200 items-center shadow-sm">
                    <View className="flex-row items-center mb-1">
                        <FontAwesome5 name="sign-in-alt" size={10} color="#2563EB" />
                        <Text className="text-[10px] font-bold text-gray-400 uppercase ml-1">Time In</Text>
                    </View>
                    <Text className="text-lg font-bold text-gray-800">{isExcused ? "--:--" : formatTime(student.time_in)}</Text>
                    {student.minutes_late > 0 && !isExcused && (
                        <Text className="text-[9px] text-amber-600 font-bold bg-amber-50 px-1.5 rounded mt-1">
                            +{student.minutes_late} min
                        </Text>
                    )}
                </View>

                <View className="flex-1 bg-white p-3 rounded-xl border border-gray-200 items-center shadow-sm">
                    <View className="flex-row items-center mb-1">
                        <FontAwesome5 name="sign-out-alt" size={10} color="#2563EB" />
                        <Text className="text-[10px] font-bold text-gray-400 uppercase ml-1">Time Out</Text>
                    </View>
                    <Text className="text-lg font-bold text-gray-800">{isExcused ? "--:--" : formatTime(student.time_out)}</Text>
                </View>

                <View className={`flex-1 p-3 rounded-xl border items-center shadow-sm ${getProximityStyle(student.proximity_status)}`}>
                    <View className="flex-row items-center mb-1">
                        <FontAwesome5 name="signal" size={10} color="#2563EB" />
                        <Text className="text-[10px] font-bold text-gray-400 uppercase ml-1">RSSI</Text>
                    </View>
                    <Text className="text-lg font-bold text-gray-800" numberOfLines={1} adjustsFontSizeToFit>
                        {student.first_rssi && !isExcused ? `${student.first_rssi}` : "--"} <Text className="text-xs font-normal text-gray-400">dBm</Text>
                    </Text>
                    <Text className="text-[9px] text-blue-600 font-bold mt-1" numberOfLines={1}>
                        {isExcused ? "Excused" : (student.proximity_status || "Unknown")}
                    </Text>
                </View>
            </View>

            {/* 3. Activity Breakdown Table */}
            <View>
                <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-sm font-bold text-gray-800 flex-row items-center">
                        <FontAwesome5 name="clock" size={12} color="#2563EB" /> Activity Breakdown
                    </Text>
                    <View className="bg-gray-100 px-2 py-1 rounded border border-gray-200">
                        <Text className="text-[10px] text-gray-500 font-bold">
                            Total Away: <Text className="text-gray-900">{isExcused ? "0s" : (student.away_analysis?.total_away_readable || "0s")}</Text>
                        </Text>
                    </View>
                </View>

                <View className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <View className="flex-row bg-gray-50 border-b border-gray-200 py-2 px-3">
                        <Text className="flex-[1.5] text-[10px] font-bold text-gray-500 uppercase">Event</Text>
                        <Text className="flex-1 text-[10px] font-bold text-gray-500 uppercase text-center">Start</Text>
                        <Text className="flex-1 text-[10px] font-bold text-gray-500 uppercase text-center">End</Text>
                        <Text className="flex-1 text-[10px] font-bold text-gray-500 uppercase text-right">Duration</Text>
                    </View>

                    {student.away_analysis?.away_intervals && student.away_analysis.away_intervals.length > 0 && !isExcused ? (
                        student.away_analysis.away_intervals.map((interval, index) => (
                            <View 
                                key={index} 
                                className={`flex-row items-center py-3 px-3 ${index !== student.away_analysis.away_intervals.length - 1 ? 'border-b border-gray-100' : ''}`}
                            >
                                <View className="flex-[1.5]">
                                    {renderReasonBadge(interval.reason)}
                                </View>
                                <Text className="flex-1 text-[10px] font-medium text-gray-600 font-mono text-center">
                                    {formatTime(interval.start)}
                                </Text>
                                <Text className="flex-1 text-[10px] font-medium text-gray-600 font-mono text-center">
                                    {formatTime(interval.end)}
                                </Text>
                                <Text className="flex-1 text-[10px] font-bold text-gray-900 text-right">
                                    {interval.duration_readable}
                                </Text>
                            </View>
                        ))
                    ) : (
                        <View className="py-8 items-center justify-center">
                            <FontAwesome5 
                              name={isExcused ? "file-alt" : "check-circle"} 
                              size={24} 
                              color={isExcused ? "#7e22ce" : "#2563EB"} 
                            />
                            <Text className="text-sm font-bold text-gray-700 mt-2">
                              {isExcused ? "Excused Session" : "Full Attendance"}
                            </Text>
                            <Text className="text-[10px] text-gray-400 mt-1">
                              {isExcused ? "This student was excused from this session." : "Student was present for the entire session."}
                            </Text>
                        </View>
                    )}
                </View>
                
                {!isExcused && (
                  <Text className="text-[10px] text-gray-400 mt-2 text-right italic">
                      * Gaps smaller than 5 minutes are ignored.
                  </Text>
                )}
            </View>

            <View className="h-10" /> 
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}