import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Image,
  StatusBar,
  Alert,
  SectionList
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { API_URL } from "../api/apiConfig";
import ViewStudentAttendanceModal, { StudentRecord } from "../components/ViewStudentAttendanceModal";

// --- Types ---
interface SessionMetadata {
  attendance_session_id: number;
  status: string;
  device_id: string;
  date: string;
  start_time: string;
  end_time: string;
  instructor: { name: string };
  course: {
    code: string;
    description: string;
    schedule_type: string;
    room: string;
  };
}

interface SessionDetailsResponse {
  session_metadata: SessionMetadata;
  students: StudentRecord[];
}

interface StudentSection {
  title: string;
  data: StudentRecord[];
}

export default function ViewSessionDetails() {
  const route = useRoute<any>();
  const { session_id } = route.params;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SessionDetailsResponse | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const formatTime = (dateTimeStr: any) => {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return "--:--";
    try {
        const timePart = dateTimeStr.includes(" ") ? dateTimeStr.split(" ")[1] : dateTimeStr;
        const parts = timePart.split(":");
        if (parts.length < 2) return timePart;
        let hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
    } catch (e) {
        return "--:--";
    }
  };

  const fetchSessionDetails = async () => {
    try {
      const response = await fetch(`${API_URL}/attendance/calculate/${session_id}`);
      const json = await response.json();
      if (response.ok) {
        setData(json);
      } else {
        Alert.alert("Error", json.message || "Failed to load details.");
      }
    } catch (error) {
      Alert.alert("Network Error", "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionDetails();
  }, [session_id]);

  const sections = useMemo(() => {
    if (!data?.students) return [];
    
    const sorter = (a: StudentRecord, b: StudentRecord) => a.student_name.localeCompare(b.student_name);

    const males = data.students.filter(s => s.sex?.toLowerCase() === 'male').sort(sorter);
    const females = data.students.filter(s => s.sex?.toLowerCase() === 'female').sort(sorter);
    
    const result: StudentSection[] = [];
    if (males.length > 0) result.push({ title: "MALE", data: males });
    if (females.length > 0) result.push({ title: "FEMALE", data: females });
    
    return result;
  }, [data?.students]);

  const getStatusStyle = (status: string) => {
    switch (status?.toLowerCase()) {
      case "present": return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
      case "late": return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
      case "absent": return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
      // ✅ Added Excused Styling (Violet)
      case "excused": return { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" };
      default: return { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" };
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const meta = data?.session_metadata;

  return (
    <SafeAreaView className="flex-1 bg-[#2563EB]">
      <StatusBar barStyle="light-content" />
      
      <View className="pt-3 pb-4 px-4 flex-row justify-between items-center">
        <Text className="text-white text-xl font-bold">Session Details</Text>
      </View>

      <View className="flex-1 bg-gray-50">
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.student_id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View className="bg-white p-5 rounded-xl shadow-sm mb-6 border border-gray-100">
              <View className="mb-4 border-b border-gray-100 pb-4">
                <Text className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">
                    {meta?.course?.code} • {meta?.course?.schedule_type || "Lecture"}
                </Text>
                <Text className="text-xl font-bold text-gray-800 leading-6">
                    {meta?.course?.description}
                </Text>
              </View>

              <View className="flex-row flex-wrap">
                  <View className="w-1/2 mb-4 pr-2">
                    <Text className="text-[10px] text-blue-500 font-bold uppercase mb-1">Date</Text>
                    <View className="flex-row items-center">
                        <Ionicons name="calendar-outline" size={14} color="#475569" />
                        <Text className="text-slate-700 font-semibold ml-1.5 text-xs">{meta?.date}</Text>
                    </View>
                  </View>

                  <View className="w-1/2 mb-4 pl-2">
                    <Text className="text-[10px] text-blue-500 font-bold uppercase mb-1">Time</Text>
                    <View className="flex-row items-center">
                        <Ionicons name="time-outline" size={14} color="#475569" />
                        <Text className="text-slate-700 font-semibold ml-1.5 text-xs">
                            {formatTime(meta?.start_time)} - {formatTime(meta?.end_time)}
                        </Text>
                    </View>
                  </View>

                  <View className="w-1/2 mb-4 pr-2">
                    <Text className="text-[10px] text-blue-500 font-bold uppercase mb-1">Room</Text>
                    <View className="flex-row items-center">
                        <Ionicons name="location-outline" size={14} color="#475569" />
                        <Text className="text-slate-700 font-semibold ml-1.5 text-xs">
                            {meta?.course?.room || "No Room"}
                        </Text>
                    </View>
                  </View>

                  <View className="w-1/2 mb-4 pl-2">
                    <Text className="text-[10px] text-blue-500 font-bold uppercase mb-1">Device ID</Text>
                    <View className="flex-row items-center">
                        <Ionicons name="phone-portrait-outline" size={14} color="#475569" />
                        <Text className="text-slate-700 font-semibold ml-1.5 text-xs font-mono">
                            {meta?.device_id || "N/A"}
                        </Text>
                    </View>
                  </View>
              </View>
            </View>
          }
          
          renderSectionHeader={({ section: { title, data } }) => (
            <View className="mx-4 mt-2 mb-3 flex-row items-center justify-between">
               <View className="bg-gray-200 py-1 px-3 rounded-lg">
                 <Text className="text-gray-600 font-bold text-[10px] uppercase">{title}</Text>
               </View>
               <Text className="text-gray-400 text-[10px] font-bold">{data.length} Students</Text>
            </View>
          )}

          renderItem={({ item }) => {
            const style = getStatusStyle(item.final_status);
            return (
              <TouchableOpacity 
                onPress={() => { setSelectedStudent(item); setModalVisible(true); }}
                className="bg-white mx-4 mb-3 p-3 rounded-xl shadow-sm flex-row items-center border border-gray-100"
              >
                <Image 
                  source={item.profile_image ? { uri: item.profile_image } : require("../assets/noProfile.webp")} 
                  className="w-10 h-10 rounded-full bg-gray-100"
                />
                <View className="flex-1 ml-3">
                  <Text className="text-slate-800 font-bold text-sm" numberOfLines={1}>{item.student_name}</Text>
                  <Text className="text-slate-400 text-[10px]">{item.student_id}</Text>
                </View>
                
                <View className="items-end">
                  <View className={`px-2 py-0.5 rounded-md border ${style.bg} ${style.border}`}>
                    <Text className={`text-[9px] font-bold uppercase ${style.text}`}>{item.final_status}</Text>
                  </View>
                  
                  {/* Show "In:" time only for Present/Late students */}
                  {item.final_status.toLowerCase() !== 'absent' && item.final_status.toLowerCase() !== 'excused' && item.time_in && item.time_in !== "--" && (
                    <Text className="text-slate-400 text-[9px] mt-1">
                      In: {formatTime(item.time_in)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {selectedStudent && (
        <ViewStudentAttendanceModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          student={selectedStudent}
        />
      )}
    </SafeAreaView>
  );
}