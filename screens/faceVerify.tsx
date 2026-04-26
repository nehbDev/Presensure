import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
  TouchableOpacity,
  AppState,
  AppStateStatus,
} from "react-native";
import {
  Camera as VisionCamera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import {
  Camera,
  Face,
} from "react-native-vision-camera-face-detector";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { Svg, Circle } from "react-native-svg";
import { FACE_API } from "../api/apiConfig";

// --- CONFIGURATION ---
const THEME_COLOR = "#2F80ED"; 
const MAX_ATTEMPTS = 3;
const CHALLENGE_TIMEOUT = 5000;
const CAPTURE_COUNTDOWN = 3;

type ChallengeType =
  | "turn_left"
  | "turn_right"
  | "smile"
  | "blink"
  | "look_up"
  | "look_down";

export default function FaceVerify({ route }: any) {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { onVerificationSuccess } = route.params || {};
  const { hasPermission, requestPermission } = useCameraPermission();
  const { width, height } = useWindowDimensions();
  const device = useCameraDevice("front");
  const cameraRef = useRef<VisionCamera>(null);

  // --- STATE ---
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);
  
  const [currentChallenge, setCurrentChallenge] = useState<ChallengeType | "none">("none");
  const [completedChallenges, setCompletedChallenges] = useState<ChallengeType[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationAttempts, setVerificationAttempts] = useState(0);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [blinkCount, setBlinkCount] = useState(0);
  const [captureTimer, setCaptureTimer] = useState(3);
  const [isCapturing, setIsCapturing] = useState(false);
  const [requiredChallenges, setRequiredChallenges] = useState(0);

  // --- REFS ---
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEyeStateRef = useRef<"open" | "closed">("open");
  const isVerificationActive = useRef(false);
  const availableChallengesRef = useRef<ChallengeType[]>([]);
  const challengeCompletedRef = useRef(false);
  const attemptsRef = useRef(0);
  const lastDetectionRef = useRef(0);
  const completedChallengesRef = useRef<ChallengeType[]>([]);
  const requiredChallengesRef = useRef(0);

  const isCameraActiveProps = 
    isCameraActive && 
    isFocused && 
    appState === "active" && 
    isCameraInitialized;

  // ✅ UPDATED: Added icon property for arrows
  const challenges: { type: ChallengeType; instruction: string; icon: string }[] = [
    { type: "turn_left", instruction: "Turn Head Left", icon: "⬅️" },
    { type: "turn_right", instruction: "Turn Head Right", icon: "➡️" },
    { type: "smile", instruction: "Smile", icon: "🙂" },
    { type: "blink", instruction: "Blink Eyes", icon: "👁️" },
    { type: "look_up", instruction: "Look Up", icon: "⬆️" },
    { type: "look_down", instruction: "Look Down", icon: "⬇️" },
  ];

  // --- INITIALIZATION ---
  
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      setAppState(nextAppState);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const initCamera = async () => {
      if (!hasPermission) {
        setIsCameraInitialized(false);
        await requestPermission();
      } else {
        const timeout = setTimeout(() => {
          setIsCameraInitialized(true);
        }, 500);
        return () => clearTimeout(timeout);
      }
    };
    initCamera();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    return () => {
      stopTimers();
      setIsCameraActive(false);
    };
  }, []);

  useEffect(() => {
    if (hasPermission && device && isCameraInitialized) {
        initializeChallenges();
    }
  }, [hasPermission, device, isCameraInitialized]);

  useEffect(() => {
    attemptsRef.current = verificationAttempts;
    completedChallengesRef.current = completedChallenges;
    requiredChallengesRef.current = requiredChallenges;
  }, [verificationAttempts, completedChallenges, requiredChallenges]);

  const stopTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);
  };

  // --- LOGIC ---
  const initializeChallenges = () => {
    const randomRequired = Math.floor(Math.random() * 2) + 2; 
    setRequiredChallenges(randomRequired);
    requiredChallengesRef.current = randomRequired;

    availableChallengesRef.current = challenges.map((c) => c.type);
    completedChallengesRef.current = [];
    setCompletedChallenges([]);
    startNewChallenge();
  };

  const startNewChallenge = () => {
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      handleMaxAttemptsReached();
      return;
    }

    if (completedChallengesRef.current.length >= requiredChallengesRef.current) {
      setCurrentChallenge("none");
      startCaptureCountdown();
      return;
    }

    if (availableChallengesRef.current.length === 0) {
      availableChallengesRef.current = challenges.map((c) => c.type);
    }

    const randomIndex = Math.floor(Math.random() * availableChallengesRef.current.length);
    const selected = availableChallengesRef.current[randomIndex];

    setCurrentChallenge(selected);
    setBlinkCount(0);
    lastEyeStateRef.current = "open";
    challengeCompletedRef.current = false;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(handleChallengeFailed, CHALLENGE_TIMEOUT);
  };

  const startCaptureCountdown = () => {
    setIsCapturing(true);
    setCaptureTimer(CAPTURE_COUNTDOWN);
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);

    captureTimerRef.current = setInterval(() => {
      setCaptureTimer((prev) => {
        if (prev <= 1) {
          if (captureTimerRef.current) clearInterval(captureTimerRef.current);
          setIsCapturing(false);
          handleVerificationComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleChallengeFailed = () => {
    stopTimers();
    Alert.alert("Time's Up", "Please react faster.", [
        { text: "Try Again", onPress: () => resetChallenges() }
    ]);
  };

  const handleChallengeSuccess = () => {
    if (challengeCompletedRef.current || currentChallenge === "none") return;

    challengeCompletedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    availableChallengesRef.current = availableChallengesRef.current.filter(
      (t) => t !== currentChallenge
    );

    const newCompleted = [...completedChallengesRef.current, currentChallenge];
    completedChallengesRef.current = newCompleted;
    setCompletedChallenges(newCompleted);

    setTimeout(startNewChallenge, 800);
  };

  const resetChallenges = () => {
    stopTimers();
    setIsCapturing(false);
    setCaptureTimer(CAPTURE_COUNTDOWN);
    setCompletedChallenges([]);
    completedChallengesRef.current = [];
    setCurrentChallenge("none");
    setTimeout(initializeChallenges, 1000);
  };

  // --- FACE DETECTION ---
  const checkChallenge = (face: Face) => {
    if (currentChallenge === "none" || isProcessing || challengeCompletedRef.current) return;

    switch (currentChallenge) {
      case "turn_left":
        if (face.yawAngle > 20) handleChallengeSuccess();
        break;
      case "turn_right":
        if (face.yawAngle < -20) handleChallengeSuccess();
        break;
      case "smile":
        if (face.smilingProbability && face.smilingProbability > 0.8) handleChallengeSuccess();
        break;
      case "blink":
        const leftClosed = face.leftEyeOpenProbability < 0.3;
        const rightClosed = face.rightEyeOpenProbability < 0.3;
        const bothOpen = face.leftEyeOpenProbability > 0.7 && face.rightEyeOpenProbability > 0.7;
        
        if (leftClosed && rightClosed && lastEyeStateRef.current === "open") {
          const newCount = blinkCount + 1;
          setBlinkCount(newCount);
          if (newCount >= 2) handleChallengeSuccess();
        }
        lastEyeStateRef.current = bothOpen ? "open" : "closed";
        break;
      case "look_up":
        if (face.pitchAngle > 20) handleChallengeSuccess();
        break;
      case "look_down":
        if (face.pitchAngle < -15) handleChallengeSuccess();
        break;
    }
  };

  const handleFacesDetection = (faces: Face[]) => {
    const now = Date.now();
    if (now - lastDetectionRef.current < 200) return;
    lastDetectionRef.current = now;

    if (faces.length > 0 && !isProcessing && currentChallenge !== "none") {
      checkChallenge(faces[0]);
    }
  };

  // --- API / CAPTURE ---
  const captureImage = async (): Promise<string | null> => {
    try {
      if (!cameraRef.current) return null;
      const photo = await cameraRef.current.takePhoto({
        flash: "off",
        enableShutterSound: false,
      });
      return `file://${photo.path}`;
    } catch (error) {
      return null;
    }
  };

  const verifyFaces = async (capturedImage: string): Promise<boolean> => {
    try {
      const userData = await AsyncStorage.getItem("user");
      if (!userData) throw new Error("No user data");
      const user = JSON.parse(userData);
      
      const response = await fetch(capturedImage);
      const blob = await response.blob();

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = (reader.result as string).split(",")[1];
            const res = await fetch(`${FACE_API}/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reference_image: user.image_link,
                captured_image: base64,
              }),
            });
            const json = await res.json();
            resolve(json.success && json.result?.verified);
          } catch (e) {
            resolve(false);
          }
        };
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return false;
    }
  };

  const handleVerificationComplete = async () => {
    if (attemptsRef.current >= MAX_ATTEMPTS) {
        handleMaxAttemptsReached();
        return;
    }
    
    if (isVerificationActive.current) return;
    
    isVerificationActive.current = true;
    setIsProcessing(true);

    try {
      const img = await captureImage();
      
      if (img) {
        const isVerified = await verifyFaces(img);
        
        const newAttempts = attemptsRef.current + 1;
        setVerificationAttempts(newAttempts);

        if (isVerified) {
          if (onVerificationSuccess) await onVerificationSuccess(true);
          Alert.alert("Success", "Identity Verified");
          setTimeout(() => navigation.goBack(), 1000);
        } else {
          if (newAttempts >= MAX_ATTEMPTS) {
             handleMaxAttemptsReached();
          } else {
             Alert.alert("Failed", `Face did not match. Attempt ${newAttempts}/${MAX_ATTEMPTS}`);
             
             setIsProcessing(false);
             isVerificationActive.current = false;
             startCaptureCountdown();
          }
        }
      } else {
        throw new Error("Capture failed");
      }
    } catch (e) {
      handleVerificationError();
    } finally {
        if (attemptsRef.current < MAX_ATTEMPTS && !isVerificationActive.current) {
             setIsProcessing(false);
        }
    }
  };

  const handleVerificationError = () => {
    const newAttempts = attemptsRef.current + 1;
    setVerificationAttempts(newAttempts);
    
    if (newAttempts >= MAX_ATTEMPTS) {
      handleMaxAttemptsReached();
    } else {
      Alert.alert("Error", "Camera error. Retrying...");
      setIsProcessing(false);
      isVerificationActive.current = false;
      startCaptureCountdown();
    }
  };

  const handleMaxAttemptsReached = () => {
    setIsCameraActive(false); 
    setIsProcessing(false);
    isVerificationActive.current = false;

    if (onVerificationSuccess) onVerificationSuccess(false);
    
    setTimeout(() => {
        Alert.alert("Verification Failed", "Maximum attempts reached.", [
          {
            text: "Back to Schedule",
            onPress: () => {
                if (navigation.canGoBack()) {
                    navigation.goBack();
                } else {
                    navigation.navigate("ViewSchedule");
                }
            },
          },
        ]);
    }, 500);
  };

  // --- RENDER ---
  if (!device || !hasPermission || !isCameraInitialized) {
    return <View style={styles.loadingContainer}><ActivityIndicator color={THEME_COLOR} /></View>;
  }
  
  if (verificationAttempts >= MAX_ATTEMPTS) {
    return (
      <View style={styles.loadingContainer}>
          <Text style={{ fontSize: 22, color: '#333', marginBottom: 20, fontWeight: 'bold' }}>
             Maximum Attempts Reached
          </Text>
          <Text style={{ marginBottom: 20, color: '#666' }}>
            Please contact support or try again later.
          </Text>
          <TouchableOpacity 
             onPress={() => {
                 navigation.navigate("ViewSchedule");
             }}
             style={{ 
               backgroundColor: THEME_COLOR, 
               paddingVertical: 12, 
               paddingHorizontal: 24, 
               borderRadius: 25 
             }}
          >
             <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>Return to Schedule</Text>
          </TouchableOpacity>
      </View>
    );
  }

  const currentData = challenges.find((c) => c.type === currentChallenge);
  const OVAL_W = width * 0.85;
  const OVAL_H = height * 0.55;
  const centerX = (width - OVAL_W) / 2;
  const centerY = (height - OVAL_H) / 2; // Centered exactly
  const radius = OVAL_W / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = requiredChallenges > 0 ? (completedChallenges.length / requiredChallenges) * 100 : 0;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {isCameraActive && (
        <Camera
          key={device.id} 
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isCameraActiveProps} 
          photo={true}
          faceDetectionCallback={handleFacesDetection}
          faceDetectionOptions={{
            performanceMode: "fast",
            classificationMode: "all",
            trackingEnabled: true,
          }}
        />
      )}

      <View style={styles.overlay}>
        {/* ✅ CHANGED: Header now shows the Challenge Instruction */}
        <View style={styles.topSection}>
            {!isProcessing && !isCapturing && currentData ? (
                <View style={styles.challengeContainer}>
                     {/* Directions Icons */}
                    <Text style={styles.directionIcon}>{currentData.icon}</Text>
                    <Text style={styles.challengeText}>{currentData.instruction}</Text>
                    {currentChallenge === "blink" && (
                        <Text style={styles.subText}>Blinks: {blinkCount}/2</Text>
                    )}
                </View>
            ) : isProcessing ? (
                <View style={styles.processingBadge}>
                     <ActivityIndicator size="small" color="#FFF" />
                     <Text style={styles.processingText}>Verifying...</Text>
                </View>
            ) : null}
        </View>

        <View style={[styles.cutoutContainer, { top: centerY, left: centerX, width: OVAL_W, height: OVAL_H }]}>
            <View style={[styles.bracket, styles.bracketTL]} />
            <View style={[styles.bracket, styles.bracketTR]} />
            <View style={[styles.bracket, styles.bracketBL]} />
            <View style={[styles.bracket, styles.bracketBR]} />

            <View style={styles.progressRing}>
                <Svg width={OVAL_W} height={OVAL_W}>
                    <Circle
                        cx={OVAL_W / 2}
                        cy={OVAL_W / 2}
                        r={radius - 5}
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth={4}
                        fill="transparent"
                    />
                    <Circle
                        cx={OVAL_W / 2}
                        cy={OVAL_W / 2}
                        r={radius - 5}
                        stroke={THEME_COLOR}
                        strokeWidth={6}
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${OVAL_W / 2} ${OVAL_W / 2})`}
                    />
                </Svg>
            </View>

            {isCapturing && (
                <View style={styles.centerContent}>
                    <Text style={styles.countdownText}>{captureTimer}</Text>
                    <Text style={styles.statusText}>Hold Still</Text>
                </View>
            )}
        </View>

        {/* ✅ CHANGED: Footer now shows the Attempts Info */}
        <View style={styles.bottomSection}>
            <Text style={styles.footerTitle}>Face Verification</Text>
            <Text style={styles.footerSubtitle}>
                Attempt {verificationAttempts + 1} of {MAX_ATTEMPTS}
            </Text>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    justifyContent: "space-between", // Pushes Top and Bottom sections apart
    paddingVertical: 40,
  },
  // --- TOP SECTION (Instruction) ---
  topSection: {
    marginTop: Platform.OS === 'ios' ? 50 : 30,
    alignItems: 'center',
    width: '100%',
    height: 120, // Reserve height so it doesn't jump
    justifyContent: 'center',
  },
  challengeContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  directionIcon: {
    fontSize: 48, // Large arrow icon
    marginBottom: 5,
    color: "#FFF",
  },
  challengeText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFF",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  subText: {
    fontSize: 14,
    color: THEME_COLOR,
    marginTop: 4,
    fontWeight: "bold",
  },
  processingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 30,
  },
  processingText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 10,
  },

  // --- CENTER (Cutout) ---
  cutoutContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  progressRing: {
    position: "absolute",
  },
  bracket: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: THEME_COLOR,
    borderWidth: 4,
  },
  bracketTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 20 },
  bracketTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 20 },
  bracketBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 20 },
  bracketBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 20 },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontSize: 72,
    fontWeight: "bold",
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  statusText: {
    fontSize: 18,
    color: THEME_COLOR,
    fontWeight: "600",
    marginTop: 10,
    textTransform: "uppercase",
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // --- BOTTOM SECTION (Attempts) ---
  bottomSection: {
    marginBottom: 20,
    alignItems: 'center',
    width: '100%',
  },
  footerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.5,
  },
  footerSubtitle: {
    fontSize: 16,
    color: "#FFF",
    marginTop: 4,
    fontWeight: "bold",
  },
});