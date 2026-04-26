import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Dimensions,
  StatusBar,
  Platform,
  TouchableOpacity
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import { API_URL } from "../api/apiConfig";

const { width } = Dimensions.get("window");

interface SessionStats {
  total_students: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
}

interface Session {
  session_id: number;
  date: string;
  day: string;
  time: string;
  type: string;
  room: string;
  status: string;
  stats: SessionStats;
}

interface CourseHeaderInfo {
  code: string;
  desc: string;
  schedule: string;
  room: string;
}

export default function ViewSessionsInstructor() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>(); 
  const { course_id, subject_code, schedule } = route.params; 

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [courseInfo, setCourseInfo] = useState<CourseHeaderInfo>({
    code: subject_code || "",
    desc: "",
    schedule: "",
    room: ""
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = async () => {
    try {
      // ✅ Fixed URL to match your backend route
      const response = await fetch(`${API_URL}/CourseAttendanceSessions/${course_id}`);
      const data = await response.json();

      if (data.success) {
        setCourseInfo({
          code: data.course_code,
          desc: data.description,
          schedule: data.schedule || "", 
          room: data.room || ""
        });
        setSessions(data.history || []);
      }
    } catch (error) {
      console.error("Error fetching sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, [course_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  const formatTimeAMPM = (timeStr: string): string => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":");
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${m || "00"} ${ampm}`;
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="text-blue-600 mt-4 font-medium">Loading history...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#2563EB" }}>
      <StatusBar barStyle="light-content" backgroundColor="#2563EB" />
      <View style={{ backgroundColor: "#2563EB", paddingTop: Platform.OS === 'android' ? 10 : 0, paddingBottom: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "bold" }}>{courseInfo.code || subject_code}</Text>
      </View>

      <View className="flex-1 bg-gray-50">
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.session_id.toString()}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2563EB"]} />}
          ListHeaderComponent={
            <View className="bg-white p-6 rounded-b-3xl shadow-sm mb-4 mx-0">
               <Text className="text-lg text-gray-800 mb-2 font-bold leading-6">{courseInfo.desc}</Text>
               <View className="flex-row items-center mb-2">
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
                  <Text className="text-sm text-gray-600 ml-2">
                    {courseInfo.schedule || (schedule ? `${schedule.days} • ${formatTimeAMPM(schedule.start_time)} - ${formatTimeAMPM(schedule.end_time)}` : "Loading...")}
                  </Text>
               </View>
               <View className="flex-row items-center mb-3">
                  <Ionicons name="location-outline" size={16} color="#6b7280" />
                  <Text className="text-sm font-semibold text-blue-600 ml-2">Room: {courseInfo.room || (schedule ? schedule.room : "Loading...")}</Text>
               </View>
               <View className="h-[1px] bg-gray-100 my-3" />
               <View className="flex-row items-center justify-between">
                   <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider">History Overview</Text>
                   <View className="flex-row items-center bg-blue-50 px-3 py-1 rounded-full">
                       <MaterialCommunityIcons name="history" size={14} color="#2563EB" />
                       <Text className="text-blue-700 text-xs font-bold ml-1.5">{sessions.length} Completed</Text>
                   </View>
               </View>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate("ViewSessionDetails", { session_id: item.session_id })}>
              <View className="bg-white rounded-xl p-4 mb-3 mx-4 shadow-md border border-gray-100">
                <View className="flex-row justify-between items-start mb-2">
                  <View>
                      <Text className="text-slate-800 text-lg font-bold">{item.date}</Text>
                      <Text className="text-slate-500 text-xs font-medium">{item.day} • {item.time}</Text>
                  </View>
                  <View className={`px-2 py-1 rounded-md ${item.type === 'Lecture' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                      <Text className={`text-[10px] font-bold uppercase ${item.type === 'Lecture' ? 'text-blue-600' : 'text-purple-600'}`}>{item.type}</Text>
                  </View>
                </View>
                <View className="flex-row items-center mb-3">
                   <MaterialCommunityIcons name="map-marker-radius" size={14} color="#94A3B8" /><Text className="text-slate-500 text-xs ml-1 font-medium">{item.room}</Text>
                </View>
                <View className="h-[1px] bg-slate-100 mb-3" />
                <View className="flex-row justify-between">
                    <StatColumn label="Present" value={item.stats.present} color="text-emerald-600" />
                    <StatColumn label="Late" value={item.stats.late} color="text-amber-500" />
                    <StatColumn label="Excused" value={item.stats.excused || 0} color="text-purple-600" />
                    <StatColumn label="Absent" value={item.stats.absent} color="text-rose-500" />
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const StatColumn = ({ label, value, color }: any) => (
    <View className="items-center flex-1 border-r border-slate-50 last:border-r-0">
        <Text className={`${color} text-lg font-bold`}>{value}</Text>
        <Text className="text-slate-400 text-[8px] uppercase font-bold tracking-tighter">{label}</Text>
    </View>
);