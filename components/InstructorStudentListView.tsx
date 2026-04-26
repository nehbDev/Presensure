import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  SectionList,
  Image,
  TouchableOpacity,
  Modal,
  Alert,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StudentAttendanceModal from "../components/StudentAttendanceModal";
import PusherService from "../services/pusherService";
import { API_URL } from "../api/apiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";

// --- Interfaces ---
interface BLEDetection {
  rssi: number;
  created_at: string;
}

export interface AwayInterval {
  start: string;
  end: string;
  duration_minutes: number;
  reason: 'NOT_DETECTED' | 'LOW_RSSI';
}

// Excuse Interface
export interface ExcuseRequest {
  excuse_id: number;
  reason: string;
  details: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Student {
  user_id: string;
  firstname: string;
  lastname: string;
  middle_initial?: string;
  suffix?: string;
  sex: string;
  role: string;
  attendance_status?: string;
  marked_at?: string;
  image_link?: string;
  program?: string;
  year?: string;
  block?: string;
  first_ble_detection?: BLEDetection;
  detection_count?: number;
  away_analysis?: {
    total_away_minutes: number;
    away_intervals: AwayInterval[];
  };
  excuse_request?: ExcuseRequest | null; 
}

interface InstructorStudentListViewProps {
  students: Student[];
  loading: boolean;
  sessionStatus: string;
  onRefresh: () => void;
  refreshing: boolean;
  onBackToBLE?: () => void;
  activeSessionId?: number | null;
  scheduleId?: number;
}

interface SectionData {
  title: string;
  data: Student[];
}

// Default reasons for absence/excuse
const DEFAULT_ABSENCE_REASONS = [
  "Medical Emergency",
  "Family Emergency",
  "Personal Reasons",
  "Transportation Issues",
  "Weather Conditions",
  "Technical Issues (Online Class)",
  "Academic Conflict",
  "Other"
];

const InstructorStudentListView: React.FC<InstructorStudentListViewProps> = ({
  students,
  loading,
  sessionStatus,
  onRefresh,
  refreshing,
  onBackToBLE,
  activeSessionId,
  scheduleId,
}) => {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  // State for Reviewing Excuse
  const [reviewExcuseStudent, setReviewExcuseStudent] = useState<Student | null>(null);
  const [isProcessingExcuse, setIsProcessingExcuse] = useState(false);

  // State for Manual Attendance
  const [manualAttendanceStudent, setManualAttendanceStudent] = useState<Student | null>(null);
  const [manualAttendanceAction, setManualAttendanceAction] = useState<'present' | 'absent' | 'excused' | null>(null);
  const [manualAttendanceReason, setManualAttendanceReason] = useState<string>('');
  const [manualAttendanceDetails, setManualAttendanceDetails] = useState<string>('');
  const [selectedDefaultReason, setSelectedDefaultReason] = useState<string>('');
  const [isSubmittingManualAttendance, setIsSubmittingManualAttendance] = useState<boolean>(false);
  const [showManualAttendanceModal, setShowManualAttendanceModal] = useState<boolean>(false);

  const [realTimeStudents, setRealTimeStudents] = useState<Student[]>(students);
  const [attendanceLoading, setAttendanceLoading] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  // Get auth token with better error handling
  const getAuthToken = async (): Promise<string | null> => {
    try {
      // Try multiple possible keys where token might be stored
      const tokenKeys = ['auth_token', 'token', 'access_token', 'user_token'];
      let token: string | null = null;
      
      for (const key of tokenKeys) {
        token = await AsyncStorage.getItem(key);
        if (token) {
          console.log(`Found token with key: ${key}`);
          break;
        }
      }
      
      if (!token) {
        console.error('No authentication token found in storage');
        // Try to get user data and extract token
        const userData = await AsyncStorage.getItem('user');
        if (userData) {
          try {
            const user = JSON.parse(userData);
            if (user.token) {
              token = user.token;
              console.log('Found token in user object');
            }
          } catch (e) {
            console.error('Error parsing user data:', e);
          }
        }
      }
      
      return token;
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  };

  // Update realTimeStudents when props change
  useEffect(() => {
    setRealTimeStudents(students);
    setInitialLoading(false);
  }, [students]);

  const handleAttendanceUpdate = useCallback((data: any) => {
    const updatedRecord = data.attendanceRecord;
    if (!updatedRecord) return;
    const userId = updatedRecord.user_id?.toString();
    if (!userId) return;

    setRealTimeStudents((prevStudents) => {
      return prevStudents.map((student) => {
        if (student.user_id === userId) {
          
          // Check if an excuse request came through the broadcast
          const broadcastExcuse = updatedRecord.excuse_request;
          
          // Merge logic: If we got a broadcast excuse, use it. Otherwise keep existing.
          const newExcuseData = broadcastExcuse ? {
             excuse_id: broadcastExcuse.excuse_id,
             reason: broadcastExcuse.reason,
             details: broadcastExcuse.details,
             status: broadcastExcuse.status
          } : student.excuse_request;

          return {
            ...student,
            attendance_status: updatedRecord.status || student.attendance_status || "present",
            marked_at: updatedRecord.time_in || student.marked_at,
            away_analysis: updatedRecord.away_analysis || student.away_analysis,
            excuse_request: newExcuseData,
          };
        }
        return student;
      });
    });
  }, []);

  const handleBLEDetection = useCallback((data: any) => {
    const bleDetection = data.bleDetection;
    if (!bleDetection) return;
    const userId = bleDetection.user_id;
    if (!userId) return;

    const rssiValue = bleDetection.rssi;
    const detectionTime = bleDetection.created_at;

    setRealTimeStudents((prevStudents) => {
      return prevStudents.map((student) => {
        if (student.user_id === userId) {
          const newDetection = { rssi: rssiValue, created_at: detectionTime };
          const currentCount = student.detection_count || 0;
          const shouldUpdateFirstDetection = !student.first_ble_detection || 
            new Date(detectionTime) < new Date(student.first_ble_detection.created_at);
          const effectiveStatus = student.attendance_status || "present";
          const effectiveMarkedAt = student.marked_at || detectionTime;

          return {
            ...student,
            first_ble_detection: shouldUpdateFirstDetection ? newDetection : student.first_ble_detection,
            detection_count: currentCount + 1,
            attendance_status: effectiveStatus,
            marked_at: effectiveMarkedAt,
          };
        }
        return student;
      });
    });
  }, []);

  const fetchSessionAttendance = useCallback(async () => {
    if (!activeSessionId) return;
    setAttendanceLoading(true);
    try {
      const token = await getAuthToken();
      const headers: any = { 
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_URL}/attendance-sessions/${activeSessionId}/attendance`, {
        method: "GET",
        headers: headers,
      });
      const data = await response.json();

      console.log("====================================");
      console.log("FETCHED SESSION ATTENDANCE DATA:");
      console.log(JSON.stringify(data, null, 2)); 
      console.log("====================================");

      if (response.ok && data.success) {
        const attendanceRecords = data.data.attendance_records || [];
        const excuseRequests = data.data.excuse_requests || [];

        console.log("EXTRACTED EXCUSE REQUESTS:", excuseRequests);

        const mergedStudents = students.map((originalStudent) => {
          const aData = attendanceRecords.find((r: any) => r.user_id === originalStudent.user_id);
          const eData = excuseRequests.find((e: any) => e.user_id === originalStudent.user_id);

          return {
            ...originalStudent,
            attendance_status: aData ? aData.status : originalStudent.attendance_status,
            marked_at: aData ? aData.time_in : originalStudent.marked_at,
            first_ble_detection: aData ? aData.first_ble_detection : originalStudent.first_ble_detection,
            detection_count: aData ? aData.detection_count : originalStudent.detection_count,
            away_analysis: aData ? aData.away_analysis : originalStudent.away_analysis,
            excuse_request: eData ? {
              excuse_id: eData.excuse_id,
              reason: eData.reason,
              details: eData.details,
              status: eData.status
            } : null,
          };
        });

        console.log("MERGED STUDENTS ARRAY:", mergedStudents);
        setRealTimeStudents(mergedStudents);
      } else if (response.status === 401) {
        Alert.alert("Session Expired", "Please login again.");
        // Navigate to login screen if needed
      }
    } catch (error) {
      console.error("Error fetching attendance:", error);
    } finally {
      setAttendanceLoading(false);
      setInitialLoading(false);
    }
  }, [activeSessionId, students]);

  useEffect(() => {
    if (activeSessionId && sessionStatus === "active") {
      setInitialLoading(true);
      fetchSessionAttendance();
    }
  }, [activeSessionId, sessionStatus, fetchSessionAttendance]);

  useEffect(() => {
    let isMounted = true;
    const setupPusher = async () => {
      if (!activeSessionId || sessionStatus !== "active") return;
      if (!isMounted) return;

      const sessionId = activeSessionId.toString();
      await PusherService.subscribeToSession(sessionId, {
        onAttendanceUpdate: (data: any) => { if (isMounted) handleAttendanceUpdate(data); },
        onBLEDetection: (data: any) => { if (isMounted) handleBLEDetection(data); },
        onError: (error: any) => console.error("Pusher error:", error),
      });
    };
    setupPusher();
    return () => {
      isMounted = false;
      if (activeSessionId) PusherService.unsubscribeFromSession(activeSessionId.toString());
    };
  }, [activeSessionId, sessionStatus, handleAttendanceUpdate, handleBLEDetection]);

  const handleRefresh = useCallback(async () => {
    if (activeSessionId && sessionStatus === "active") {
      await fetchSessionAttendance();
    } else {
      onRefresh();
    }
  }, [activeSessionId, sessionStatus, fetchSessionAttendance, onRefresh]);

  const handleStudentPress = (student: Student) => {
    setSelectedStudent(student);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedStudent(null);
  };

  // Handle Manual Attendance
  const openManualAttendanceModal = (student: Student, action: 'present' | 'absent' | 'excused') => {
    setManualAttendanceStudent(student);
    setManualAttendanceAction(action);
    setManualAttendanceReason('');
    setManualAttendanceDetails('');
    setSelectedDefaultReason('');
    setShowManualAttendanceModal(true);
  };

  const handleManualAttendanceSubmit = async () => {
  if (!manualAttendanceStudent || !manualAttendanceAction || !activeSessionId) return;

  // Validate reason for absent or excused
  if ((manualAttendanceAction === 'absent' || manualAttendanceAction === 'excused') && !manualAttendanceReason && !selectedDefaultReason) {
    Alert.alert("Error", "Please provide a reason for the absence/excuse.");
    return;
  }

  setIsSubmittingManualAttendance(true);
  try {
    const payload: any = {
      session_id: activeSessionId,
      user_id: manualAttendanceStudent.user_id,
      status: manualAttendanceAction,
    };

    // REMOVED: time_in for present action
    // Only add reason and details for absent or excused
    if (manualAttendanceAction === 'absent' || manualAttendanceAction === 'excused') {
      const finalReason = selectedDefaultReason || manualAttendanceReason;
      payload.reason = finalReason;
      payload.details = manualAttendanceDetails;
    }

    console.log("Sending manual attendance payload:", payload);

    const response = await fetch(`${API_URL}/attendance/manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("Manual attendance response:", data);

    if (response.ok && data.success) {
      Alert.alert("Success", `Student marked as ${manualAttendanceAction.toUpperCase()} successfully.`);
      
      // Refresh the attendance data to get the latest from backend
      await fetchSessionAttendance();
      
      setShowManualAttendanceModal(false);
      setManualAttendanceStudent(null);
      setManualAttendanceAction(null);
    } else {
      Alert.alert("Error", data.message || "Failed to update attendance.");
    }
  } catch (error) {
    console.error("Manual attendance error:", error);
    Alert.alert("Error", "Network error occurred. Please try again.");
  } finally {
    setIsSubmittingManualAttendance(false);
  }
};

  // Handle Approve/Reject API Call
  const handleExcuseAction = async (status: 'approved' | 'rejected') => {
    if (!reviewExcuseStudent?.excuse_request) return;
    
    setIsProcessingExcuse(true);
    try {
      const token = await getAuthToken();
      
      if (!token) {
        Alert.alert("Authentication Error", "Please login again.");
        setIsProcessingExcuse(false);
        return;
      }
      
      const response = await fetch(`${API_URL}/attendance/excuse/${reviewExcuseStudent.excuse_request.excuse_id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert("Success", `Request ${status} successfully.`);
        
        // Refresh the attendance data
        await fetchSessionAttendance();
        setReviewExcuseStudent(null);
      } else if (response.status === 401) {
        Alert.alert("Session Expired", "Please login again.");
      } else {
        Alert.alert("Error", data.message || "Failed to update request.");
      }
    } catch (error) {
      console.error("Excuse action error:", error);
      Alert.alert("Error", "Network error occurred.");
    } finally {
      setIsProcessingExcuse(false);
    }
  };

  const formatStudentName = (student: Student): string => {
    let name = `${student.lastname}, ${student.firstname}`;
    if (student.middle_initial) name += ` ${student.middle_initial}.`;
    if (student.suffix) name += ` ${student.suffix}`;
    return name;
  };

  const getGroupedStudents = (): SectionData[] => {
    const sortStudents = (a: Student, b: Student) => {
      const nameA = `${a.lastname} ${a.firstname}`.toLowerCase();
      const nameB = `${b.lastname} ${b.firstname}`.toLowerCase();
      return nameA.localeCompare(nameB);
    };

    const maleStudents = realTimeStudents.filter((s) => s.sex?.toLowerCase() === "male").sort(sortStudents);
    const femaleStudents = realTimeStudents.filter((s) => s.sex?.toLowerCase() === "female").sort(sortStudents);
    const otherStudents = realTimeStudents.filter((s) => !["male", "female"].includes(s.sex?.toLowerCase())).sort(sortStudents);

    const sections: SectionData[] = [];
    if (maleStudents.length > 0) sections.push({ title: "MALE", data: maleStudents });
    if (femaleStudents.length > 0) sections.push({ title: "FEMALE", data: femaleStudents });
    if (otherStudents.length > 0) sections.push({ title: "OTHER", data: otherStudents });
    return sections;
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <View className="bg-gray-50 py-2 px-2">
      <View className="flex-row items-center ml-1">
        <View className={`w-2 h-2 rounded-full mr-2 ${title === "MALE" ? "bg-blue-400" : title === "FEMALE" ? "bg-pink-400" : "bg-purple-400"}`} />
        <Text className="text-xs font-bold text-gray-500 tracking-wider">
          {title} STUDENTS
        </Text>
      </View>
    </View>
  );

  // --- STUDENT ITEM WITH 3-DOT MENU ---
  const StudentItem = ({ student }: { student: Student }) => {
    const [showMenu, setShowMenu] = useState<boolean>(false);
    const detectionCount = student.detection_count || 0;
    const totalAwayMinutes = student.away_analysis?.total_away_minutes || 0;
    
    const rawStatus = student.attendance_status?.toLowerCase();
    const isMarked = !!student.marked_at;

    let isPresent = false;
    let isLate = false;
    let isExcused = false;

    if (rawStatus === 'excused') {
        isExcused = true;
    } else if (rawStatus === 'present' || (isMarked && rawStatus !== 'late')) {
        isPresent = true;
    } else if (rawStatus === 'late') {
        isLate = true;
    }

    let statusColor = "bg-gray-100";
    let statusTextColor = "text-gray-500";
    let statusIcon: any = "close-circle-outline";
    let statusText = "ABSENT";

    if (isExcused) {
        statusColor = "bg-purple-100";
        statusTextColor = "text-purple-700";
        statusIcon = "document-text";
        statusText = "EXCUSED";
    } else if (isPresent) {
        statusColor = "bg-green-100";
        statusTextColor = "text-green-700";
        statusIcon = "checkmark-circle";
        statusText = "PRESENT";
    } else if (isLate) {
        statusColor = "bg-yellow-100";
        statusTextColor = "text-yellow-700";
        statusIcon = "time";
        statusText = "LATE";
    }

    // CHECK FOR PENDING EXCUSE
    const hasPendingExcuse = student.excuse_request?.status === 'pending';

    return (
      <>
        <TouchableOpacity
          onPress={() => handleStudentPress(student)}
          className="bg-white rounded-xl border border-gray-100 mb-3 mx-2 shadow-sm overflow-hidden"
        >
          <View className="p-4">
            <View className="flex-row items-start">
              <View className="mr-3">
                {student.image_link ? (
                  <Image source={{ uri: student.image_link }} className="w-12 h-12 rounded-full border border-gray-200" resizeMode="cover" />
                ) : (
                  <View className="w-12 h-12 rounded-full bg-gray-100 items-center justify-center border border-gray-200">
                    <Ionicons name="person" size={20} color="#9ca3af" />
                  </View>
                )}
              </View>

              <View className="flex-1">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-2">
                    <Text className="text-gray-900 font-bold text-base leading-tight" numberOfLines={1}>
                      {formatStudentName(student)}
                    </Text>
                    <Text className="text-gray-500 text-xs mt-0.5 font-medium tracking-wide">
                      {student.user_id}
                    </Text>
                  </View>

                  <View className="flex-row items-center">
                    <View className={`flex-row items-center px-2 py-1 rounded-full ${statusColor} mr-2`}>
                      <Ionicons name={statusIcon} size={12} color={
                          statusTextColor === "text-green-700" ? "#15803d" : 
                          statusTextColor === "text-yellow-700" ? "#a16207" : 
                          statusTextColor === "text-purple-700" ? "#7e22ce" : "#6b7280"
                      } />
                      <Text className={`ml-1 text-[10px] font-bold ${statusTextColor}`}>
                        {statusText}
                      </Text>
                    </View>
                    
                    {/* 3-Dot Menu Button */}
                    <TouchableOpacity 
                      onPress={() => setShowMenu(true)}
                      className="p-1"
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>
                </View>
                {student.marked_at && !isExcused && (
                  <Text className="text-[10px] text-gray-400 mt-1">
                    {new Date(student.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* EXCUSE PENDING BADGE / FOOTER */}
          {hasPendingExcuse ? (
            <TouchableOpacity 
              onPress={() => setReviewExcuseStudent(student)}
              className="bg-blue-50 px-4 py-2.5 flex-row items-center justify-between border-t border-blue-100"
            >
              <View className="flex-row items-center">
                <Ionicons name="mail-unread" size={16} color="#2563eb" />
                <Text className="text-xs text-blue-700 font-semibold ml-2">Review Excuse Request</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#2563eb" />
            </TouchableOpacity>
          ) : (detectionCount > 0 || totalAwayMinutes > 0) ? (
            <View className="bg-gray-50 px-4 py-2 flex-row items-center border-t border-gray-100 justify-between">
              <View className="flex-row items-center">
                <Ionicons name="bluetooth" size={12} color="#3b82f6" />
                <Text className="text-[10px] text-gray-600 ml-1">
                  <Text className="font-medium text-blue-600">{detectionCount}</Text> detections
                </Text>
              </View>
              {totalAwayMinutes > 0 && (
                <View className="flex-row items-center">
                  <Ionicons name="walk-outline" size={12} color="#f59e0b" />
                  <Text className="text-[10px] text-amber-700 ml-1 font-medium">
                    Away {totalAwayMinutes}m
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </TouchableOpacity>

        {/* Menu Modal for Manual Attendance */}
        <Modal
          visible={showMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowMenu(false)}>
            <View className="flex-1 bg-black/50 justify-center items-center">
              <View className="bg-white rounded-xl w-64 overflow-hidden">
                <View className="p-4 border-b border-gray-100">
                  <Text className="text-center font-bold text-gray-800">
                    Mark Attendance for
                  </Text>
                  <Text className="text-center text-sm text-gray-600 mt-1">
                    {formatStudentName(student)}
                  </Text>
                </View>
                
                <TouchableOpacity
                  onPress={() => {
                    setShowMenu(false);
                    openManualAttendanceModal(student, 'present');
                  }}
                  className="flex-row items-center px-4 py-3 border-b border-gray-50"
                >
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text className="ml-3 text-gray-700 font-medium">Present</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={() => {
                    setShowMenu(false);
                    openManualAttendanceModal(student, 'absent');
                  }}
                  className="flex-row items-center px-4 py-3 border-b border-gray-50"
                >
                  <Ionicons name="close-circle" size={20} color="#ef4444" />
                  <Text className="ml-3 text-gray-700 font-medium">Absent</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={() => {
                    setShowMenu(false);
                    openManualAttendanceModal(student, 'excused');
                  }}
                  className="flex-row items-center px-4 py-3"
                >
                  <Ionicons name="document-text" size={20} color="#8b5cf6" />
                  <Text className="ml-3 text-gray-700 font-medium">Excused</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </>
    );
  };

  // --- RENDER ---
  const LoadingScreen = () => (
    <View className="flex-1 justify-center items-center bg-gray-50">
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text className="text-center text-gray-500 mt-4 text-lg">Loading attendance data...</Text>
    </View>
  );

  if (initialLoading && activeSessionId && sessionStatus === "active") return <LoadingScreen />;

  const groupedSections = getGroupedStudents();

  return (
    <View className="flex-1 bg-gray-50">
      {onBackToBLE && (
        <View className="bg-white px-4 py-3 border-b border-gray-200 shadow-sm z-10">
          <TouchableOpacity onPress={onBackToBLE} className="flex-row items-center justify-center bg-blue-50 py-2.5 rounded-lg border border-blue-100">
            <Ionicons name="bluetooth" size={18} color="#2563eb" />
            <Text className="text-blue-600 font-semibold ml-2">Return to Session Controls</Text>
          </TouchableOpacity>
        </View>
      )}

      {(attendanceLoading || refreshing) && (
        <View className="absolute top-0 left-0 right-0 z-10 bg-blue-50 py-2 items-center">
          <View className="flex-row items-center bg-white/80 px-4 py-1 rounded-full shadow-sm">
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text className="text-blue-600 ml-2 text-xs font-medium">Updating...</Text>
          </View>
        </View>
      )}

      <View className="flex-1 p-4">
        {groupedSections.length > 0 ? (
          <SectionList
            sections={groupedSections}
            keyExtractor={(item) => item.user_id}
            renderItem={({ item }) => <StudentItem student={item} />}
            renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
            refreshControl={<RefreshControl refreshing={refreshing || attendanceLoading} onRefresh={handleRefresh} colors={["#3b82f6"]} tintColor="#3b82f6" />}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        ) : (
          <View className="flex-1 justify-center items-center p-8">
            <View className="bg-gray-100 p-4 rounded-full mb-4"><Ionicons name="people" size={32} color="#9ca3af" /></View>
            <Text className="text-gray-600 text-lg font-medium">No Students Found</Text>
          </View>
        )}
      </View>

      <StudentAttendanceModal visible={modalVisible} student={selectedStudent} onClose={handleCloseModal} />

      {/* Manual Attendance Modal */}
      <Modal
        visible={showManualAttendanceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManualAttendanceModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-10 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-gray-900">
                {manualAttendanceAction === 'present' ? 'Mark as Present' : 
                 manualAttendanceAction === 'absent' ? 'Mark as Absent' : 'Mark as Excused'}
              </Text>
              <TouchableOpacity onPress={() => setShowManualAttendanceModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-gray-600 mb-4">
              Student: <Text className="font-bold text-gray-900">{manualAttendanceStudent && formatStudentName(manualAttendanceStudent)}</Text>
            </Text>

            {(manualAttendanceAction === 'absent' || manualAttendanceAction === 'excused') && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-sm font-semibold text-gray-700 mb-2">Select Reason</Text>
                
                {/* Default Reasons */}
                <View className="mb-4">
                  {DEFAULT_ABSENCE_REASONS.map((reason, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => {
                        setSelectedDefaultReason(reason);
                        setManualAttendanceReason('');
                      }}
                      className={`p-3 rounded-lg mb-2 border ${
                        selectedDefaultReason === reason 
                          ? 'bg-blue-50 border-blue-300' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <Text className={`${
                        selectedDefaultReason === reason ? 'text-blue-700 font-medium' : 'text-gray-700'
                      }`}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text className="text-sm font-semibold text-gray-700 mb-2">Or specify custom reason</Text>
                <TextInput
                  className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-4"
                  placeholder="Enter custom reason..."
                  value={manualAttendanceReason}
                  onChangeText={(text) => {
                    setManualAttendanceReason(text);
                    setSelectedDefaultReason('');
                  }}
                  multiline
                />

                <Text className="text-sm font-semibold text-gray-700 mb-2">Additional Details (Optional)</Text>
                <TextInput
                  className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-6"
                  placeholder="Enter additional details..."
                  value={manualAttendanceDetails}
                  onChangeText={setManualAttendanceDetails}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </ScrollView>
            )}

            {manualAttendanceAction === 'present' && (
              <View className="mb-6">
                <Text className="text-gray-600 text-center">
                  Marking as present will record the current time as the attendance time.
                </Text>
              </View>
            )}

            <View className="flex-row space-x-3">
              <TouchableOpacity 
                onPress={() => setShowManualAttendanceModal(false)}
                className="flex-1 bg-gray-100 py-4 rounded-xl items-center justify-center mr-2"
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleManualAttendanceSubmit}
                disabled={isSubmittingManualAttendance}
                className={`flex-1 py-4 rounded-xl items-center justify-center ml-2 ${
                  manualAttendanceAction === 'present' ? 'bg-green-600' : 
                  manualAttendanceAction === 'absent' ? 'bg-red-600' : 'bg-purple-600'
                }`}
              >
                {isSubmittingManualAttendance ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">
                    Confirm {manualAttendanceAction?.toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Review Excuse Modal */}
      <Modal
        visible={!!reviewExcuseStudent}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewExcuseStudent(null)}
      >
         <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-white rounded-t-3xl p-6 pb-10">
                <View className="flex-row justify-between items-center mb-6">
                    <Text className="text-xl font-bold text-gray-900">Review Excuse</Text>
                    <TouchableOpacity onPress={() => setReviewExcuseStudent(null)}>
                        <Ionicons name="close" size={24} color="#6b7280" />
                    </TouchableOpacity>
                </View>

                {reviewExcuseStudent?.excuse_request && (
                    <>
                        <Text className="text-sm font-semibold text-gray-500 mb-1">STUDENT</Text>
                        <Text className="text-lg font-bold text-gray-800 mb-4">{formatStudentName(reviewExcuseStudent)}</Text>

                        <Text className="text-sm font-semibold text-gray-500 mb-1">REASON</Text>
                        <Text className="text-base text-gray-800 mb-4">{reviewExcuseStudent.excuse_request.reason}</Text>

                        <Text className="text-sm font-semibold text-gray-500 mb-1">DETAILS</Text>
                        <View className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100">
                            <Text className="text-gray-700 leading-5">
                                {reviewExcuseStudent.excuse_request.details || "No additional details provided."}
                            </Text>
                        </View>

                        <View className="flex-row space-x-3">
                            <TouchableOpacity 
                                onPress={() => handleExcuseAction('rejected')}
                                disabled={isProcessingExcuse}
                                className="flex-1 bg-red-50 py-4 rounded-xl border border-red-200 items-center justify-center mr-2"
                            >
                                <Text className="text-red-600 font-bold text-base">Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={() => handleExcuseAction('approved')}
                                disabled={isProcessingExcuse}
                                className="flex-1 bg-blue-600 py-4 rounded-xl items-center justify-center ml-2"
                            >
                                {isProcessingExcuse ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text className="text-white font-bold text-base">Approve</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
         </View>
      </Modal>
    </View>
  );
};

export default InstructorStudentListView;