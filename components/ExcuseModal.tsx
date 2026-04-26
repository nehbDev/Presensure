import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const BluePalette = {
  primary: "#2563EB",
  dark: "#1E3A8A",
  mid: "#3B82F6",
  pale: "#EFF6FF",
  border: "#BFDBFE",
  textHeavy: "#1E3A8A",
  textMedium: "#4B5563",
};

interface ExcuseData {
  excuse_id: number;
  reason: string;
  details: string;
  status: string;
}

interface ExcuseModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (reason: string, details: string) => void;
  isSubmitting: boolean;
  existingData?: ExcuseData | null; // NEW PROP
}

const EXCUSE_REASONS = [
  "Medical / Sick",
  "Family Emergency",
  "School Event",
  "Device/Tech Issue",
  "Other",
];

const ExcuseModal: React.FC<ExcuseModalProps> = ({
  isVisible,
  onClose,
  onSubmit,
  isSubmitting,
  existingData,
}) => {
  const [selectedReason, setSelectedReason] = useState(EXCUSE_REASONS[0]);
  const [details, setDetails] = useState("");

  // Populate data when modal opens if existingData is present
  useEffect(() => {
    if (isVisible) {
      if (existingData) {
        setSelectedReason(
          EXCUSE_REASONS.includes(existingData.reason)
            ? existingData.reason
            : EXCUSE_REASONS[4]
        );
        setDetails(existingData.details);
      } else {
        setSelectedReason(EXCUSE_REASONS[0]);
        setDetails("");
      }
    }
  }, [isVisible, existingData]);

  const handleSubmit = () => {
    onSubmit(selectedReason, details);
  };

  const handleClose = () => {
    onClose();
  };

  const isEditing = !!existingData;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.modalContainer}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>
                  {isEditing ? "Edit Excuse Request" : "Apply for Excuse"}
                </Text>
                <TouchableOpacity onPress={handleClose} disabled={isSubmitting}>
                  <Ionicons name="close" size={24} color={BluePalette.textMedium} />
                </TouchableOpacity>
              </View>

              <Text style={styles.description}>
                {isEditing 
                  ? "You can update your pending excuse request details below." 
                  : "Submit an excuse request to your instructor for this session."}
              </Text>

              <Text style={styles.label}>Select Reason</Text>
              <View style={styles.reasonsContainer}>
                {EXCUSE_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={[
                      styles.reasonPill,
                      selectedReason === reason && styles.selectedPill,
                    ]}
                    onPress={() => setSelectedReason(reason)}
                  >
                    <Text
                      style={[
                        styles.reasonText,
                        selectedReason === reason && styles.selectedReasonText,
                      ]}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Additional Details (Required)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Briefly explain your situation..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                value={details}
                onChangeText={setDetails}
                maxLength={100}
              />

              <Text style={styles.charCounter}>
                {details.length}/100
              </Text>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (isSubmitting || details.trim() === "") && styles.disabledButton,
                ]}
                onPress={handleSubmit}
                disabled={isSubmitting || details.trim() === ""}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {isEditing ? "Update Request" : "Submit Request"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ... (Keep styles exactly the same) ...
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "center", padding: 20 },
  modalContainer: { backgroundColor: "white", borderRadius: 20, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: BluePalette.textHeavy },
  description: { fontSize: 14, color: BluePalette.textMedium, marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "600", color: BluePalette.textHeavy, marginBottom: 10, textTransform: "uppercase" },
  reasonsContainer: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  reasonPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BluePalette.border, backgroundColor: "white", marginRight: 8, marginBottom: 10 },
  selectedPill: { backgroundColor: BluePalette.primary, borderColor: BluePalette.primary },
  reasonText: { fontSize: 13, color: BluePalette.textMedium, fontWeight: "500" },
  selectedReasonText: { color: "white", fontWeight: "600" },
  textInput: { backgroundColor: BluePalette.pale, borderRadius: 12, padding: 16, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: BluePalette.border, marginBottom: 24, fontSize: 14, color: BluePalette.dark },
  submitButton: { backgroundColor: BluePalette.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  disabledButton: { backgroundColor: "#93C5FD" },
  submitButtonText: { color: "white", fontWeight: "600", fontSize: 16 },
  charCounter: { textAlign: "right", fontSize: 12, color: BluePalette.textMedium, marginTop: -16, marginBottom: 24 },
});

export default ExcuseModal;