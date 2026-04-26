import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  StatusBar,
  Platform,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../api/apiConfig";

interface StudentSessionItem {
  session_id: number;
  date: string; 
  day: string; 
  time: string; 
  end_time: string | null;
  type: string; 
  room: string;
  status: string; 
  arrival_time: string;
  minutes_late: number;
}

interface CourseSummary {
  total_sessions: number;
  total_present: number;
  total_late: number;
  total_excused: number;
  total_absent: number;
}

export default function ViewSessionsStudent() {
  const route = useRoute<any>();
  const { course_id, subject_code, schedule } = route.params;

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<StudentSessionItem[]>([]);
  const [summary, setSummary] = useState<CourseSummary>({
    total_sessions: 0,
    total_present: 0,
    total_late: 0,
    total_excused: 0,
    total_absent: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Smart Formatter: Handles raw "HH:mm:ss" or already formatted "hh:mm AM/PM"
  const formatTime = (timeStr: string) => {
    if (!timeStr || timeStr === "--") return "--";
    
    // If it already contains AM or PM, it's already formatted by the backend
    if (timeStr.toUpperCase().includes("AM") || timeStr.toUpperCase().includes("PM")) {
        return timeStr;
    }

    const cleanTime = timeStr.includes(" ") ? timeStr.split(" ")[1] : timeStr;
    const parts = cleanTime.split(":");
    if (parts.length < 2) return cleanTime;

    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12; 

    return `${hours}:${minutes} ${ampm}`;
  };

  const fetchHistory = async () => {
    try {
      const userData = await AsyncStorage.getItem("user");
      if (!userData) return;
      const user = JSON.parse(userData);

      const response = await fetch(`${API_URL}/student/course-history/${course_id}/${user.id}`);
      const data = await response.json();

      if (data.success) {
        setHistory(data.session_history || []);
        setSummary(data.course_summary);
      }
    } catch (error) {
      console.error("Error fetching student history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [course_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "present": return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
      case "late": return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
      case "excused": return { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" };
      case "absent": return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#2563EB" }}>
      <StatusBar barStyle="light-content" backgroundColor="#2563EB" />
      <View style={{ backgroundColor: "#2563EB", paddingTop: Platform.OS === "android" ? 10 : 0, paddingBottom: 15, paddingHorizontal: 16 }}>
        <Text style={{ color: "white", fontSize: 20, fontWeight: "bold" }}>{subject_code}</Text>
      </View>

      <View className="flex-1 bg-gray-50">
        <FlatList
          data={history}
          keyExtractor={(item) => item.session_id.toString()}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2563EB"]} />}
          ListHeaderComponent={
            <View className="bg-white p-6 rounded-b-3xl shadow-sm mb-4 mx-0">
              <Text className="text-lg text-gray-800 mb-2 font-bold leading-6">{schedule?.subject_description || "Course History"}</Text>
              <View className="flex-row items-center mb-4">
                <Ionicons name="calendar" size={16} color="#6b7280" /><Text className="text-sm text-gray-600 ml-2">{schedule?.schedule || "Weekly Schedule"}</Text>
              </View>
              <View className="h-[1px] bg-gray-100 mb-4" />
              <View className="flex-row justify-between">
                <StatBox label="Present" value={summary.total_present} color="text-emerald-600" />
                <StatBox label="Late" value={summary.total_late} color="text-amber-600" />
                <StatBox label="Excused" value={summary.total_excused} color="text-purple-600" />
                <StatBox label="Absent" value={summary.total_absent} color="text-rose-600" />
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const colors = getStatusColor(item.status);
            const isExcused = item.status.toLowerCase() === 'excused';

            return (
              <View className="bg-white rounded-xl p-4 mb-3 mx-4 shadow-md border border-gray-100">
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1 pr-2">
                    <Text className="text-slate-800 text-lg font-bold">{item.date}</Text>
                    <Text className="text-slate-500 text-xs font-medium mt-0.5">
                      {item.day} • {formatTime(item.time)} - {item.end_time ? formatTime(item.end_time) : "Ongoing"}
                    </Text>
                  </View>
                  <View className={`px-2 py-1 rounded-md border ${colors.bg} ${colors.border}`}>
                    <Text className={`text-[10px] font-bold uppercase ${colors.text}`}>{item.status}</Text>
                  </View>
                </View>

                <View className="flex-row justify-between items-end mt-2">
                  <View>
                    <View className="flex-row items-center mb-1">
                      <MaterialCommunityIcons name="map-marker-radius" size={14} color="#94A3B8" />
                      <Text className="text-slate-500 text-xs ml-1 font-medium">{item.room}</Text>
                    </View>
                    <View className="flex-row items-center">
                      <MaterialCommunityIcons name="school" size={14} color="#94A3B8" />
                      <Text className="text-slate-500 text-xs ml-1 font-medium">{item.type}</Text>
                    </View>
                  </View>

                  <View className="items-end">
                    <Text className="text-[10px] text-slate-400 font-bold uppercase">Record</Text>
                    <Text className="text-slate-800 font-bold text-sm">
                      {isExcused ? "Approved Excuse" : (item.arrival_time !== '--' ? formatTime(item.arrival_time) : "No Scan")}
                    </Text>
                    {!isExcused && item.minutes_late > 0 && (
                      <Text className="text-[10px] text-amber-600 font-bold">+{item.minutes_late} min late</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const StatBox = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <View className="items-center flex-1">
    <Text className={`text-xl font-bold ${color}`}>{value}</Text>
    <Text className="text-[10px] text-gray-400 font-bold uppercase">{label}</Text>
  </View>
);