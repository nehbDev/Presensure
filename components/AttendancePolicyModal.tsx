import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  FlatList,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "../api/apiConfig";

// --- Types ---
interface Course {
  course_id: number;
  subject_code: string;
  description: string;
}

interface PolicyData {
  attendance_policy_id?: number;
  policy_name: string;
  is_default: boolean;
  calculation_type: "accumulation" | "deduction";
  late_threshold_minutes: string;
  absent_threshold_minutes: string;
  lates_to_absent: string;
  consecutive_absents_to_fail: string;
  attendance_weight: string;
  base_score: string;
  absent_penalty: string;
  late_penalty: string;
  course_ids: number[];
  courses?: Course[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const defaultState: PolicyData = {
  policy_name: "",
  is_default: false,
  calculation_type: "accumulation",
  late_threshold_minutes: "15",
  absent_threshold_minutes: "60",
  lates_to_absent: "3",
  consecutive_absents_to_fail: "5",
  attendance_weight: "10",
  base_score: "100",
  absent_penalty: "5",
  late_penalty: "2.5",
  course_ids: [],
};

// --- COLORS ---
const COLORS = {
  primary: "#2563EB",
  primaryLight: "#EFF6FF",
  textDark: "#1E293B",
  textMedium: "#64748B",
  textLight: "#94A3B8",
  border: "#E2E8F0",
  white: "#FFFFFF",
  background: "#F1F5F9",
  success: "#10B981",
  successBg: "#D1FAE5",
  warning: "#F59E0B",
  warningBg: "#FEF3C7",
};

export default function AttendancePolicyModal({ visible, onClose }: Props) {
  const [viewMode, setViewMode] = useState<"list" | "form">("list");
  
  // Data State
  const [policies, setPolicies] = useState<PolicyData[]>([]);
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  
  const [formData, setFormData] = useState<PolicyData>(defaultState);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  // --- 1. Fetch Data ---
  const fetchData = async () => {
    setFetchLoading(true);
    try {
      const token = await AsyncStorage.getItem("token");
      const userStr = await AsyncStorage.getItem("user");
      const user = userStr ? JSON.parse(userStr) : null;
      const headers = { Authorization: `Bearer ${token}` };

      const [policyRes, courseRes] = await Promise.all([
        fetch(`${API_URL}/attendance-policy/my`, { headers }),
        fetch(`${API_URL}/getCourses?user_id=${user?.id}&role=${user?.role || 'instructor'}`, { headers })
      ]);

      const policyJson = await policyRes.json();
      const courseJson = await courseRes.json();

      if (policyRes.ok && policyJson.data) {
        setPolicies(policyJson.data);
      }

      if (courseRes.ok && courseJson.my_records) {
        setAvailableCourses(courseJson.my_records);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      Alert.alert("Error", "Failed to load data.");
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchData();
      setViewMode("list");
    }
  }, [visible]);

  // --- Logic: Filter Courses ---
  const assignedCourseIds = policies
    .filter((p) => p.attendance_policy_id !== formData.attendance_policy_id)
    .flatMap((p) => p.courses?.map((c) => c.course_id) || []);

  const filteredCourses = availableCourses.filter(
    (course) => !assignedCourseIds.includes(course.course_id)
  );

  const hasExistingDefault = policies.some(
    (p) => Boolean(p.is_default) && p.attendance_policy_id !== formData.attendance_policy_id
  );

  // --- 2. Handlers ---
  const handleCreateNew = () => {
    setFormData(defaultState);
    setViewMode("form");
  };

  const handleEdit = (policy: PolicyData) => {
    const existingIds = policy.courses?.map((c) => c.course_id) || [];

    setFormData({
      attendance_policy_id: policy.attendance_policy_id,
      policy_name: policy.policy_name,
      is_default: Boolean(policy.is_default),
      calculation_type: policy.calculation_type || "accumulation",
      late_threshold_minutes: String(policy.late_threshold_minutes),
      absent_threshold_minutes: String(policy.absent_threshold_minutes),
      lates_to_absent: String(policy.lates_to_absent || ""),
      consecutive_absents_to_fail: String(policy.consecutive_absents_to_fail || ""),
      attendance_weight: String(policy.attendance_weight || ""),
      base_score: String(policy.base_score || "100"),
      absent_penalty: String(policy.absent_penalty || "5"),
      late_penalty: String(policy.late_penalty || "2.5"),
      course_ids: existingIds,
    });
    setViewMode("form");
  };

  const handleCourseToggle = (courseId: number) => {
    setFormData((prev) => {
      const exists = prev.course_ids.includes(courseId);
      return {
        ...prev,
        course_ids: exists
          ? prev.course_ids.filter((id) => id !== courseId)
          : [...prev.course_ids, courseId],
      };
    });
  };

  const handleDefaultChange = (val: boolean) => {
    setFormData((prev) => ({
      ...prev,
      is_default: val,
      course_ids: val ? [] : prev.course_ids,
    }));
  };

  const handleSave = async () => {
    if (!formData.policy_name) {
      Alert.alert("Validation", "Policy Name is required.");
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem("token");
      const user = await AsyncStorage.getItem("user");
      const userId = user ? JSON.parse(user).id : null;

      const payload = {
        attendance_policy_id: formData.attendance_policy_id,
        user_id: userId,
        policy_name: formData.policy_name,
        is_default: formData.is_default,
        calculation_type: formData.calculation_type,
        late_threshold_minutes: parseInt(formData.late_threshold_minutes) || 0,
        absent_threshold_minutes: parseInt(formData.absent_threshold_minutes) || 0,
        lates_to_absent: parseInt(formData.lates_to_absent) || null,
        consecutive_absents_to_fail: parseInt(formData.consecutive_absents_to_fail) || null,
        attendance_weight: parseFloat(formData.attendance_weight) || 0,
        base_score: 100,
        absent_penalty: parseFloat(formData.absent_penalty) || 0,
        late_penalty: parseFloat(formData.late_penalty) || 0,
        course_ids: formData.course_ids,
      };

      const response = await fetch(`${API_URL}/attendance-policy/my`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (response.ok) {
        Alert.alert("Success", "Policy saved successfully.");
        await fetchData();
        setViewMode("list");
      } else {
        const errorMsg = json.errors
          ? (Object.values(json.errors as Record<string, string[]>)[0][0] as string)
          : json.message || "Failed to save policy.";
        Alert.alert("Error", errorMsg);
      }
    } catch (error) {
      Alert.alert("Error", "Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {viewMode === "list"
                  ? "Attendance Policies"
                  : formData.attendance_policy_id
                  ? "Edit Policy"
                  : "Create Policy"}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="white" />
            </TouchableOpacity>
          </View>

          {fetchLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <View style={styles.contentContainer}>
              {/* === LIST MODE === */}
              {viewMode === "list" && (
                <View style={styles.listContainer}>
                  {policies.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>No policies found.</Text>
                      <TouchableOpacity onPress={handleCreateNew}>
                        <Text style={styles.createLink}>Create your first one</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <FlatList
                      data={policies}
                      keyExtractor={(item, index) => String(item.attendance_policy_id || index)}
                      contentContainerStyle={{ paddingBottom: 20 }}
                      renderItem={({ item }) => (
                        <View style={styles.policyCard}>
                          <View style={styles.policyInfo}>
                            <Text style={styles.policyName}>{item.policy_name}</Text>
                            {Boolean(item.is_default) && (
                              <View style={styles.defaultBadge}>
                                <Text style={styles.defaultBadgeText}>Default</Text>
                              </View>
                            )}
                            {!item.is_default && (
                                <Text style={styles.courseCountText}>
                                    {item.courses?.length || 0} Courses Assigned
                                </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => handleEdit(item)}
                            style={styles.editButton}
                          >
                            <Text style={styles.editButtonText}>Edit</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    />
                  )}

                  <TouchableOpacity
                    onPress={handleCreateNew}
                    style={styles.createButton}
                  >
                    <Text style={styles.createButtonText}>+ Create New Policy</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* === FORM MODE === */}
              {viewMode === "form" && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
                  
                  {/* 1. General Settings */}
                  <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>General Settings</Text>

                    <InputItem
                      label="Policy Name"
                      value={formData.policy_name}
                      onChange={(v: string) => setFormData({ ...formData, policy_name: v })}
                      placeholder="e.g. Strict Policy"
                      maxLength={25}
                    />

                    {/* Calculation Type Toggle */}
                    <View style={styles.toggleGroup}>
                      <Text style={styles.inputLabel}>Calculation Type</Text>
                      <View style={styles.toggleContainer}>
                        <TouchableOpacity
                          onPress={() => setFormData({ ...formData, calculation_type: "accumulation" })}
                          style={[
                            styles.toggleBtn,
                            formData.calculation_type === "accumulation" && styles.toggleBtnActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.toggleText,
                              formData.calculation_type === "accumulation" && styles.toggleTextActive,
                            ]}
                          >
                            Accumulation
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setFormData({ ...formData, calculation_type: "deduction" })}
                          style={[
                            styles.toggleBtn,
                            formData.calculation_type === "deduction" && styles.toggleBtnActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.toggleText,
                              formData.calculation_type === "deduction" && styles.toggleTextActive,
                            ]}
                          >
                            Deduction
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Default Checkbox */}
                    {hasExistingDefault && !formData.is_default ? (
                       <View style={styles.warningBox}>
                           <Text style={styles.warningTitle}>Default Policy Active</Text>
                           <Text style={styles.warningText}>You already have a global default policy set.</Text>
                       </View>
                    ) : (
                        <View style={[styles.switchContainer, formData.is_default && styles.switchContainerActive]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.switchLabel}>Set as Default Policy</Text>
                            <Text style={styles.switchSubLabel}>Applies to all unassigned courses</Text>
                        </View>
                        <Switch
                            value={formData.is_default}
                            onValueChange={handleDefaultChange}
                            trackColor={{ false: "#cbd5e1", true: "#bbf7d0" }}
                            thumbColor={formData.is_default ? "#16a34a" : "#f4f4f5"}
                        />
                        </View>
                    )}
                  </View>

                  {/* 2. Grading Logic */}
                  <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Grading Logic</Text>

                    {formData.calculation_type === "accumulation" ? (
                      <View style={styles.infoBoxBlue}>
                        <Text style={{ fontSize: 18, marginRight: 8 }}>ℹ️</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.infoBoxTitleBlue}>Accumulation Mode Active:</Text>
                          <Text style={styles.infoBoxTextBlue}>
                            Students start at 0 and earn points per session.
                          </Text>
                          <View style={styles.miniCodeBlock}>
                            <Text style={styles.miniCodeText}>Present = 1.0 | Late = 0.5 | Absent = 0</Text>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <View style={{ marginBottom: 16 }}>
                        <View style={styles.infoBoxAmber}>
                          <Text style={{ fontSize: 18, marginRight: 8 }}>ℹ️</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.infoBoxTitleAmber}>Deduction Mode Active:</Text>
                            <Text style={styles.infoBoxTextAmber}>
                              Start with 100 points. Deduct points per infraction.
                            </Text>
                          </View>
                        </View>
                        <View style={styles.row}>
                          <InputItem
                            label="Base Score"
                            value="100"
                            onChange={() => {}}
                            editable={false}
                            style={{ width: "31%" }}
                          />
                          <InputItem
                            label="Absent (-)"
                            value={formData.absent_penalty}
                            onChange={(v: string) => setFormData({ ...formData, absent_penalty: v })}
                            style={{ width: "31%" }}
                          />
                          <InputItem
                            label="Late (-)"
                            value={formData.late_penalty}
                            onChange={(v: string) => setFormData({ ...formData, late_penalty: v })}
                            style={{ width: "31%" }}
                          />
                        </View>
                      </View>
                    )}

                    <View style={styles.row}>
                      <InputItem
                        label="Grade Weight (%)"
                        value={formData.attendance_weight}
                        onChange={(v: string) => setFormData({ ...formData, attendance_weight: v })}
                        style={{ width: "100%" }}
                      />
                    </View>

                    <View style={styles.row}>
                      <InputItem
                        label="Late Threshold (min)"
                        value={formData.late_threshold_minutes}
                        onChange={(v: string) => setFormData({ ...formData, late_threshold_minutes: v })}
                        style={{ width: "48%" }}
                      />
                      <InputItem
                        label="Absent Threshold (min)"
                        value={formData.absent_threshold_minutes}
                        onChange={(v: string) => setFormData({ ...formData, absent_threshold_minutes: v })}
                        style={{ width: "48%" }}
                      />
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.row}>
                      <InputItem
                        label="Lates to 1 Absent"
                        value={formData.lates_to_absent}
                        onChange={(v: string) => setFormData({ ...formData, lates_to_absent: v })}
                        style={{ width: "48%" }}
                        helper="Count"
                      />
                      <InputItem
                        label="Absents to Fail"
                        value={formData.consecutive_absents_to_fail}
                        onChange={(v: string) => setFormData({ ...formData, consecutive_absents_to_fail: v })}
                        style={{ width: "48%" }}
                        helper="Consecutive"
                      />
                    </View>
                  </View>

                  {/* 3. ✅ Course Selection (Fixed Scrollable View) */}
                  <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Course Selection</Text>
                    
                    {formData.is_default ? (
                       <View style={styles.defaultInfoBox}>
                           <View style={styles.defaultIconCircle}>
                                <Ionicons name="globe-outline" size={24} color={COLORS.success} />
                           </View>
                           <Text style={styles.defaultInfoTitle}>Global Default Policy</Text>
                           <Text style={styles.defaultInfoText}>This policy will apply to all courses that don't have a specific policy assigned.</Text>
                       </View>
                    ) : (
                        // ✅ REPLACED View with ScrollView for inner scrolling
                        <ScrollView 
                            style={styles.courseListContainer} 
                            nestedScrollEnabled={true} // Allow scrolling within parent ScrollView
                            contentContainerStyle={{ padding: 5 }}
                        >
                            {filteredCourses.length === 0 ? (
                                <Text style={styles.noCoursesText}>No available courses found. All your courses might already be assigned to other policies.</Text>
                            ) : (
                                filteredCourses.map((course) => {
                                    const isSelected = formData.course_ids.includes(course.course_id);
                                    return (
                                        <TouchableOpacity 
                                            key={course.course_id}
                                            style={[styles.courseItem, isSelected && styles.courseItemSelected]}
                                            onPress={() => handleCourseToggle(course.course_id)}
                                        >
                                            <Ionicons 
                                                name={isSelected ? "checkbox" : "square-outline"} 
                                                size={22} 
                                                color={isSelected ? COLORS.primary : COLORS.textLight} 
                                            />
                                            <View style={{flex: 1, marginLeft: 10}}>
                                                <Text style={styles.courseCode}>{course.subject_code}</Text>
                                                <Text style={styles.courseDesc} numberOfLines={1}>{course.description}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>
                    )}
                  </View>

                  {/* Buttons */}
                  <View style={styles.footerButtons}>
                    <TouchableOpacity
                      onPress={() => setViewMode("list")}
                      style={styles.cancelButton}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleSave}
                      disabled={loading}
                      style={styles.saveButton}
                    >
                      {loading && <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />}
                      <Text style={styles.saveButtonText}>Save Policy</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Reusable Input Component
const InputItem = ({ label, value, onChange, style, editable = true, placeholder, helper, maxLength }: any) => (
  <View style={[styles.inputWrapper, style]}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="numeric"
      editable={editable}
      placeholder={placeholder}
      maxLength={maxLength}
      style={[
        styles.textInput,
        editable ? styles.textInputEditable : styles.textInputDisabled,
      ]}
    />
    {helper && <Text style={styles.helperText}>{helper}</Text>}
  </View>
);

// --- STYLESHEET ---
const styles = StyleSheet.create({
  // Modal Layout
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    overflow: "hidden",
    flex: 1,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  
  // Header
  header: {
    backgroundColor: COLORS.primary,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.white,
  },
  closeButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    padding: 8,
    borderRadius: 20,
    marginLeft: 12,
  },

  // Containers
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  contentContainer: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
    padding: 20,
  },
  sectionContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.textDark,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },

  // List Item
  policyCard: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  policyInfo: {
    flex: 1,
    paddingRight: 16,
  },
  policyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.textDark,
    marginBottom: 4,
  },
  courseCountText: {
      fontSize: 11,
      color: COLORS.textMedium,
      marginTop: 2
  },
  defaultBadge: {
    backgroundColor: COLORS.successBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.success,
    textTransform: "uppercase",
  },
  editButton: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editButtonText: {
    color: COLORS.primary,
    fontWeight: "bold",
    fontSize: 14,
  },

  // Inputs
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.textMedium,
    textTransform: "uppercase",
    marginBottom: 6,
    marginLeft: 4,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  textInputEditable: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
  },
  textInputDisabled: {
    backgroundColor: "#F1F5F9",
    borderColor: COLORS.border,
    color: COLORS.textLight,
  },
  helperText: {
    fontSize: 10,
    color: COLORS.textLight,
    marginLeft: 4,
    marginTop: 2,
  },

  // Toggle Group
  toggleGroup: {
    marginTop: 8,
    marginBottom: 16,
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 4,
    borderRadius: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: COLORS.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontWeight: "bold",
    color: COLORS.textMedium,
  },
  toggleTextActive: {
    color: COLORS.primary,
  },

  // Switch Container
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
  },
  switchContainerActive: {
    backgroundColor: COLORS.successBg,
    borderColor: "#bbf7d0",
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.textDark,
  },
  switchSubLabel: {
    fontSize: 10,
    color: COLORS.textMedium,
  },
  warningBox: {
      padding: 12,
      backgroundColor: COLORS.warningBg,
      borderColor: "#FCD34D",
      borderWidth: 1,
      borderRadius: 10,
  },
  warningTitle: {
      fontWeight: 'bold',
      color: "#92400E",
      fontSize: 13
  },
  warningText: {
      color: "#92400E",
      fontSize: 12
  },

  // Info Boxes
  infoBoxBlue: {
    backgroundColor: COLORS.primaryLight,
    borderColor: "#DBEAFE",
    borderWidth: 1,
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    flexDirection: "row",
  },
  infoBoxTitleBlue: {
    color: "#1E40AF",
    fontWeight: "bold",
    fontSize: 14,
    marginBottom: 4,
  },
  infoBoxTextBlue: {
    color: "#1E3A8A",
    fontSize: 12,
    lineHeight: 16,
  },
  infoBoxAmber: {
    backgroundColor: COLORS.warningBg,
    borderColor: "#FDE68A",
    borderWidth: 1,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: "row",
  },
  infoBoxTitleAmber: {
    color: "#92400E",
    fontWeight: "bold",
    fontSize: 14,
    marginBottom: 4,
  },
  infoBoxTextAmber: {
    color: "#B45309",
    fontSize: 12,
    lineHeight: 16,
  },
  miniCodeBlock: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.6)",
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  miniCodeText: {
    color: "#1E40AF",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },

  // Course Selection UI
  defaultInfoBox: {
      alignItems: 'center',
      paddingVertical: 20
  },
  defaultIconCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: COLORS.successBg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10
  },
  defaultInfoTitle: {
      fontWeight: 'bold',
      color: "#065F46",
      fontSize: 16,
      marginBottom: 4
  },
  defaultInfoText: {
      textAlign: 'center',
      color: "#065F46",
      fontSize: 13,
      paddingHorizontal: 20
  },
  courseListContainer: {
      backgroundColor: "#F8FAFC",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: COLORS.border,
      maxHeight: 250, // Fixed height for scrolling
      flexGrow: 0,
  },
  courseItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: "#F1F5F9",
      backgroundColor: COLORS.white,
      marginBottom: 2,
      borderRadius: 6
  },
  courseItemSelected: {
      backgroundColor: COLORS.primaryLight,
      borderColor: COLORS.primary,
      borderWidth: 1
  },
  courseCode: {
      fontWeight: 'bold',
      color: COLORS.textDark,
      fontSize: 14
  },
  courseDesc: {
      color: COLORS.textMedium,
      fontSize: 12
  },
  noCoursesText: {
      padding: 20,
      textAlign: 'center',
      color: COLORS.textMedium,
      fontSize: 13
  },

  // Layout Utils
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.background,
    marginVertical: 16,
  },

  // Footer Buttons
  footerButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingBottom: 24,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  cancelButtonText: {
    color: COLORS.textMedium,
    fontWeight: "bold",
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  saveButtonText: {
    color: COLORS.white,
    fontWeight: "bold",
  },
  createButton: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    borderStyle: "dashed",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  createButtonText: {
    color: COLORS.textMedium,
    fontWeight: "bold",
    fontSize: 16,
  },
  
  // Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: COLORS.textLight,
    marginBottom: 16,
  },
  createLink: {
    color: COLORS.primary,
    fontWeight: "bold",
  },
});