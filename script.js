// Global variables - add these at the very top of your script
let mixer = null;
let speakingAnimation = null;
let speaking = false;
let audioContext = null;
let analyser = null;
let dataArray = null;
let audioSource = null;

    // Update these constants at the top of your script
    const ELEVEN_LABS_API_KEY = 'enter-your-key-here'; // Replace with your actual key
    const ELEVEN_LABS_VOICE_ID = 'TxGEqnHWrfWFTfGW9XjX'; // Josh's voice ID
    const ELEVEN_LABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

    const GEMINI_API_KEY = 'enter-your-key-here';
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';

    // Add conversation context
    const conversationContext = {
        history: [],
        personality: `You are a helpful and friendly AI assistant. 
        Keep responses natural and conversational. 
        Limit responses to 2-3 sentences.`
    };

    // Update the voice settings for a more natural male voice
    const elevenLabsConfig = {
        voiceSettings: {
            stability: 0.71,
            similarity_boost: 0.5,
            speaking_rate: 1.0
        }
    };

    // Add this helper function for lip sync
    function updateLipSync(analyser, dataArray, jawBone, visemeMorphTargets) {
if (!analyser || !dataArray) return;

analyser.getByteFrequencyData(dataArray);

// Get average amplitude from the frequency data
const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
const normalizedValue = average / 255; // Normalize to 0-1

// Enhance the movement by increasing the multiplier
const movementMultiplier = 1.5; // Increased from 1.0
const enhancedValue = Math.pow(normalizedValue, 0.8) * movementMultiplier; // Add power curve for more dynamic movement

// Use the enhanced value to control mouth/jaw movement
if (jawBone) {
    const origRot = jawBone.userData.originalRotation;
    // Increase jaw rotation range
    const jawRotation = -0.4 * enhancedValue; // Increased from -0.2
    jawBone.rotation.x = origRot.x + jawRotation;
}

// Animate visemes based on amplitude with increased intensity
const visemeKeys = Object.keys(visemeMorphTargets);
if (visemeKeys.length > 0) {
    // Find visemes for speech
    const speechVisemes = visemeKeys.filter(key => {
        const lowerKey = key.toLowerCase();
        return (lowerKey.includes('aa') || 
                lowerKey.includes('oh') || 
                lowerKey.includes('m') ||
                lowerKey.includes('ch') ||
                lowerKey.includes('ih')) && 
                !lowerKey.includes('smile') && 
                !lowerKey.includes('happy');
    });
    
    if (speechVisemes.length > 0) {
        // Use multiple visemes for more dynamic movement
        speechVisemes.forEach((visemeKey, index) => {
            const viseme = visemeMorphTargets[visemeKey];
            if (viseme) {
                // Apply different intensities to different visemes
                const intensity = 1.2; // Increased from 0.7
                const phase = (index / speechVisemes.length) * Math.PI;
                const value = Math.sin(phase + Date.now() * 0.01) * 0.3 + 0.7;
                viseme.mesh.morphTargetInfluences[viseme.index] = enhancedValue * intensity * value;
            }
        });
    }
}
}

    // Clean text for speech by removing markdown and special characters
    function cleanTextForSpeech(text) {
        return text
            .replace(/\*\*/g, '') // Remove bold markers
            .replace(/\*/g, '')   // Remove italic markers
            .replace(/_/g, '')    // Remove underscore emphasis
            .replace(/`/g, '')    // Remove code markers
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace [text](link) with just text
            .replace(/#{1,6}\s/g, '') // Remove heading markers
            .replace(/\n/g, ' ')  // Replace newlines with spaces
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();             // Remove leading/trailing whitespace
    }

    // Update the generateSpeech function
    async function generateSpeech(text) {
        const cleanedText = cleanTextForSpeech(text);
        
        try {
            const response = await fetch(`${ELEVEN_LABS_API_URL}/${ELEVEN_LABS_VOICE_ID}`, {
                method: 'POST',
                headers: {
                    'xi-api-key': ELEVEN_LABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: cleanedText,
                    model_id: "eleven_monolingual_v1",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true
                    }
                })
            });

            console.log('Eleven Labs response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Eleven Labs API Error:', errorData);
                throw new Error(`Eleven Labs API error: ${response.status}`);
            }

            return response;
        } catch (error) {
            console.error('Speech generation error:', error);
            throw error;
        }
    }

    // Update the getGeminiResponse function
    async function getGeminiResponse(userInput) {
        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gemini-2.0-flash',
                    contents: [{
                        role: 'user',
                        parts: [{ text: userInput }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 100,
                        topP: 0.8,
                        topK: 40
                    },
                    safetySettings: [
                        {
                            category: "HARM_CATEGORY_HARASSMENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_HATE_SPEECH",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Gemini API error:', error);
            throw error;
        }
    }

    // Update the speak function to handle errors better
    async function speak(text) {
        if (!text || speaking) return;
        
        speaking = true;
        updateStatus('Speaking...');
        
        try {
            speechBubble.textContent = text;
            speechBubble.style.opacity = 1;
            
            const response = await generateSpeech(text);
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // Set up audio handling
            await setupAudioAnalysis(audio);
            
            // Play speaking animation
            playSpeakingAnimation();
            
            // Estimate duration and set up animations
            const wordCount = text.split(/\s+/).length;
            const estimatedDuration = (wordCount / 2) + (text.length / 15);
            
            const timeline = gsap.timeline();
            addNaturalMovements(timeline, estimatedDuration);
            addHandGestureSequence(timeline, estimatedDuration);
            
            // Play audio with proper error handling
            audio.onerror = (e) => {
                console.error('Audio playback error:', e);
                speaking = false;
                updateStatus('Audio playback failed');
                speechBubble.style.opacity = 0;
            };
            
            audio.oncanplay = () => {
                audio.play().catch(error => {
                    console.error('Audio play error:', error);
                    speaking = false;
                    updateStatus('Failed to play audio');
                });
            };
            
            audio.onended = () => {
                speaking = false;
                speechBubble.style.opacity = 0;
                setArmsToRestingPosition();
                cleanupAudioAnalysis();
                updateStatus('Ready');
                URL.revokeObjectURL(audioUrl); // Clean up the URL
            };
            
        } catch (error) {
            console.error('Speech error:', error);
            showError(`Speech synthesis failed: ${error.message}`);
            speaking = false;
            speechBubble.style.opacity = 0;
            updateStatus('Error occurred');
        }
    }

    // Add this new code for speech recognition
    let recognition;

    function setupSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = function(event) {
                const text = event.results[0][0].transcript;
                textInput.value = text;
                handleConversation(text);
            };

            recognition.onerror = function(event) {
                console.error('Speech recognition error:', event.error);
                updateStatus('Ready');
            };

            // Add voice input button
            const voiceButton = document.createElement('button');
            voiceButton.innerHTML = `
    <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
`;
            voiceButton.className = 'voice-button';
            voiceButton.onclick = startListening;
            document.getElementById('input-container').appendChild(voiceButton);
        }
    }

    function startListening() {
        if (recognition && !speaking) {
            recognition.start();
            updateStatus('Listening...');
        }
    }

    // Call this after the page loads
    setupSpeechRecognition();

    // Scene setup
    const sceneContainer = document.getElementById('scene-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // Set scene background to white
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 2.5); // Adjusted camera position
    camera.lookAt(0, 1.5, 0); // Look at the middle of the avatar
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xffffff); // Set background color to white
    renderer.shadowMap.enabled = true;
    sceneContainer.appendChild(renderer.domElement);
    
    // Debug console
    const debugElement = document.getElementById('debug');
    debugElement.style.display = 'none'; // Hide debug by default
    
    function debugLog(message) {
        const line = document.createElement('div');
        line.innerText = message;
        debugElement.appendChild(line);
        while (debugElement.children.length > 20) {
            debugElement.removeChild(debugElement.firstChild);
        }
        debugElement.scrollTop = debugElement.scrollHeight;
    }
    
    // Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.5; // Increased minimum distance
    controls.maxDistance = 5;
    controls.maxPolarAngle = Math.PI / 1.5; // Adjusted to prevent looking too far down
    controls.minPolarAngle = Math.PI / 4; // Added to prevent looking too far up
    controls.target.set(0, 1.5, 0); // Set orbit controls target to avatar center
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(0, 10, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Reduce intensity of front light
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.5);
    frontLight.position.set(0, 1, 5);
    scene.add(frontLight);

    // Reduce intensity of side lights
    const leftLight = new THREE.DirectionalLight(0xffffff, 0.3);
    leftLight.position.set(-5, 2, 2);
    scene.add(leftLight);

    const rightLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rightLight.position.set(5, 2, 2);
    scene.add(rightLight);
    
    // Avatar model
    let avatar;
    let headBone;
    let jawBone;
    let neckBone;
    let spineBone;
    let leftEyeBone;
    let rightEyeBone;
    let leftArmBone;
    let rightArmBone;
    let leftForearmBone;
    let rightForearmBone;
    let leftHandBone;
    let rightHandBone;
    let leftShoulderBone;
    let rightShoulderBone;
    let skeletonHelper; // For debugging bones
    const modelUrl = 'https://models.readyplayer.me/682731afda5b0e9a896365d4.glb';
    
    // Natural resting pose for arms
    const restingPose = {
        leftShoulder: { x: 0, y: 0, z: -0.05 }, // Slightly back, less extreme
        rightShoulder: { x: 0, y: 0, z: 0.05 }, // Slightly back, less extreme
        leftArm: { x: 0.1, y: 0, z: -0.05 }, // Down and slightly out, less extreme
        rightArm: { x: 0.1, y: 0, z: 0.05 }, // Down and slightly out, less extreme
        leftForearm: { x: 0.15, y: 0, z: 0 }, // Slightly bent, less extreme
        rightForearm: { x: 0.15, y: 0, z: 0 }, // Slightly bent, less extreme
        leftHand: { x: 0, y: 0, z: -0.1 }, // Slightly rotated inward
        rightHand: { x: 0, y: 0, z: 0.1 } // Slightly rotated inward
    };
    
    // Viseme map for lip sync
    const visemeMap = {
        'a': 'viseme_aa',
        'e': 'viseme_E',
        'i': 'viseme_I',
        'o': 'viseme_O',
        'u': 'viseme_U',
        'f': 'viseme_F',
        'v': 'viseme_F',
        'm': 'viseme_M',
        'b': 'viseme_M',
        'p': 'viseme_M',
        's': 'viseme_S',
        'z': 'viseme_S',
        'th': 'viseme_TH',
        'ch': 'viseme_CH',
        'sh': 'viseme_SH',
        'j': 'viseme_CH',
        'l': 'viseme_L',
        'r': 'viseme_R',
        'w': 'viseme_W',
        'y': 'viseme_I',
        'k': 'viseme_K',
        'g': 'viseme_K',
        'n': 'viseme_N',
        't': 'viseme_T',
        'd': 'viseme_T',
        'default': 'viseme_CH'
    };
    
    // Store all found viseme morph targets
    const visemeMorphTargets = {};
    
    // Hand gesture definitions - updated with more subtle movements
    const handGestures = [
        {
            name: "pointing",
            leftHand: {
                rotation: { x: -0.3, y: 0, z: 0 }, // Less extreme
                forearm: { x: 0.2, y: 0, z: 0 }    // Less extreme
            },
            rightHand: {
                rotation: { x: -0.3, y: 0, z: 0 },
                forearm: { x: 0.2, y: 0, z: 0 }
            }
        },
        {
            name: "open_palm",
            leftHand: {
                rotation: { x: -0.4, y: 0, z: -0.1 }, // Less extreme
                forearm: { x: 0.3, y: 0, z: 0 }       // Less extreme
            },
            rightHand: {
                rotation: { x: -0.4, y: 0, z: 0.1 },
                forearm: { x: 0.3, y: 0, z: 0 }
            }
        },
        {
            name: "emphasis",
            leftHand: {
                rotation: { x: -0.2, y: 0, z: -0.2 }, // Less extreme
                forearm: { x: 0.1, y: 0.1, z: -0.1 }  // Less extreme
            },
            rightHand: {
                rotation: { x: -0.2, y: 0, z: 0.2 },
                forearm: { x: 0.1, y: -0.1, z: 0.1 }
            }
        },
        {
            name: "thinking",
            leftHand: {
                rotation: { x: 0, y: 0, z: 0 },       // Resting
                forearm: { x: 0, y: 0, z: 0 }         // Resting
            },
            rightHand: {
                rotation: { x: 0.8, y: 0, z: 0 },     // Less extreme
                forearm: { x: 0.7, y: 0, z: 0 }       // Less extreme
            }
        }
    ];
    
    // Audio context and analysis for lip sync
    // let audioContext; // Removed duplicate declaration
    // analyser already declared in global scope
    // dataArray already declared in global scope
    //++-let audioSource;
    let audioCanvas;
    let audioCanvasCtx;
    let speechSynthesisUtterance;
    
    // Voice selection
    const voiceSelect = document.getElementById('voice-select');
    let availableVoices = [];

    // Voice type selection
    const voiceTypeOptions = document.querySelectorAll('.voice-type-option');
    const voiceSettings = document.getElementById('voice-settings');
    let currentVoiceType = 'bark'; // Default to Bark

    // Error message handling
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const dismissError = document.getElementById('dismiss-error');

    dismissError.addEventListener('click', function() {
        errorMessage.style.display = 'none';
    });

    function showError(message) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';
    }

    // Set up voice type selection
    voiceTypeOptions.forEach(option => {
        option.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            
            // Update active class
            voiceTypeOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            // Update current voice type
            currentVoiceType = type;
            
            // Show/hide voice settings
            if (type === 'bark') {
                voiceSettings.style.display = 'block';
                voiceSelect.style.display = 'none';
            } else {
                voiceSettings.style.display = 'none';
                voiceSelect.style.display = 'block';
            }
            
            debugLog(`Switched to ${type} voice synthesis`);
        });
    });
    
    // Lip sync variables
    let lipSyncActive = false;
    let currentMouthValue = 0;
    let targetMouthValue = 0;
    let lastSyllableTime = 0;
    let lipSyncInterval;
    let currentViseme = null;
    
    // Initialize speech synthesis and populate voice selector
    function initSpeechSynthesis() {
        // Populate voice dropdown when voices are available
        function populateVoices() {
            // Get the available voices
            availableVoices = speechSynthesis.getVoices();
            
            // Clear existing options
            voiceSelect.innerHTML = '';
            
            // Find Microsoft Ravi voice
            let raviVoice = null;
            let defaultVoiceIndex = 0;
            
            // Filter for more natural voices
            const preferredVoices = [];
            const otherVoices = [];
            
            availableVoices.forEach((voice, index) => {
                // Check if this is Microsoft Ravi
                if (voice.name.includes('Microsoft Ravi') || 
                    (voice.name.includes('Ravi') && voice.name.includes('India'))) {
                    raviVoice = voice;
                    defaultVoiceIndex = index;
                    debugLog(`Found Microsoft Ravi voice: ${voice.name}`);
                }
                
                // Prioritize human-sounding voices
                if (voice.name.includes('Google') || 
                    voice.name.includes('Natural') || 
                    voice.name.includes('Premium') ||
                    voice.name.includes('Daniel') ||
                    voice.name.includes('Samantha') ||
                    voice.name.includes('Karen') ||
                    voice.name.includes('David') ||
                    voice.name.includes('Ravi')) {
                    preferredVoices.push(voice);
                } else {
                    otherVoices.push(voice);
                }
            });
            
            // Sort both arrays by name
            const compareFn = (a, b) => a.name.localeCompare(b.name);
            preferredVoices.sort(compareFn);
            otherVoices.sort(compareFn);
            
            // Add preferred voices first
            if (preferredVoices.length > 0) {
                const preferredGroup = document.createElement('optgroup');
                preferredGroup.label = 'Recommended Voices';
                
                preferredVoices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    preferredGroup.appendChild(option);
                });
                
                voiceSelect.appendChild(preferredGroup);
            }
            
            // Add other voices
            if (otherVoices.length > 0) {
                const otherGroup = document.createElement('optgroup');
                otherGroup.label = 'Other Voices';
                
                otherVoices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    otherGroup.appendChild(option);
                });
                
                voiceSelect.appendChild(otherGroup);
            }
            
            // Set Microsoft Ravi as default if found
            if (raviVoice) {
                voiceSelect.value = raviVoice.name;
                debugLog(`Set default voice to Microsoft Ravi`);
            } else {
                // If Ravi not found, try to find any Indian English voice
                for (let i = 0; i < availableVoices.length; i++) {
                    const voice = availableVoices[i];
                    if (voice.lang === 'en-IN' || 
                        (voice.lang.startsWith('en') && voice.name.includes('India'))) {
                        voiceSelect.value = voice.name;
                        debugLog(`Ravi not found, using alternative Indian English voice: ${voice.name}`);
                        break;
                    }
                }
            }
            
            debugLog(`Loaded ${availableVoices.length} voices`);
        }
        
        // Call populateVoices once initially
        populateVoices();
        
        // Populate again when voices change (needed for Chrome)
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = populateVoices;
        }
    }
    
    function enhanceVoiceQuality(utterance) {
        // Get the selected voice
        const selectedVoiceName = voiceSelect.value;
        const selectedVoice = availableVoices.find(voice => voice.name === selectedVoiceName);
        
        if (selectedVoice) {
            utterance.voice = selectedVoice;
            debugLog(`Using voice: ${selectedVoice.name}`);
        }
        
        // Optimize voice parameters for more natural speech
        utterance.rate = 0.95; // Slightly slower than default for more clarity
        utterance.pitch = 1.0; // Natural pitch
        utterance.volume = 1.0; // Full volume
        
        // Add slight pauses at punctuation for more natural rhythm
        utterance.text = utterance.text.replace(/([.!?])/g, '$1^');
        
        return utterance;
    }
    
    // Initialize audio context and visualization
    function initAudioContext() {
        try {
            // Create audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            // Set up audio canvas for visualization (helpful for debugging)
            audioCanvas = document.getElementById('audio-canvas');
            audioCanvasCtx = audioCanvas.getContext('2d');
            
            debugLog("Audio context initialized");
        } catch (e) {
            debugLog("Error initializing audio context: " + e);
        }
    }
    
    // Connect speech synthesis to audio analysis
    function connectSpeechToAnalysis(utterance) {
        // This is a workaround since we can't directly access the audio stream from speech synthesis
        // We'll use a syllable-based approach with timing
        
        // Parse the text into syllables
        const words = utterance.text.split(/\s+/);
        const syllables = [];
        
        words.forEach(word => {
            // Very simple syllable detection - count vowels
            let vowelCount = 0;
            for (let i = 0; i < word.length; i++) {
                if ('aeiou'.includes(word[i].toLowerCase())) {
                    vowelCount++;
                }
            }
            
            // Ensure at least one syllable per word
            syllables.push(Math.max(1, vowelCount));
        });
        
        // Calculate total syllables
        const totalSyllables = syllables.reduce((a, b) => a + b, 0);
        
        // Estimate speech duration based on text length and speech rate
        const estimatedDuration = (utterance.text.length / 15) * (1 / utterance.rate) * 1000; // in ms
        
        // Calculate average syllable duration
        const syllableDuration = estimatedDuration / totalSyllables;
        
        // Start lip sync animation
        lipSyncActive = true;
        lastSyllableTime = Date.now();
        
        // Clear any existing interval
        if (lipSyncInterval) clearInterval(lipSyncInterval);
        
        // Create a list of neutral mouth visemes (avoiding smile-related ones)
        const neutralVisemes = [];
        
        // Find neutral visemes that don't involve smiling
        for (const key in visemeMorphTargets) {
            // Skip any viseme that might involve smiling
            if (key.toLowerCase().includes('smile') || 
                key.toLowerCase().includes('happy') || 
                key.toLowerCase().includes('grin')) {
                debugLog(`Skipping smile-related viseme: ${key}`);
                continue;
            }
            
            // Prefer visemes that are more neutral in expression
            if (key.toLowerCase().includes('aa') || 
                key.toLowerCase().includes('oh') || 
                key.toLowerCase().includes('m') || 
                key.toLowerCase().includes('th') ||
                key.toLowerCase().includes('ch')) {
                neutralVisemes.push(key);
            }
        }
        
        // If we couldn't find specific neutral visemes, use any non-smile visemes
        if (neutralVisemes.length === 0) {
            for (const key in visemeMorphTargets) {
                if (!key.toLowerCase().includes('smile') && 
                    !key.toLowerCase().includes('happy') && 
                    !key.toLowerCase().includes('grin')) {
                    neutralVisemes.push(key);
                }
            }
        }
        
        debugLog(`Using neutral visemes: ${neutralVisemes.join(', ')}`);
        
        // Set up interval for syllable-based lip sync
        lipSyncInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - lastSyllableTime;
            
            // Cycle through mouth shapes based on timing
            if (elapsed > syllableDuration) {
                // Time for a new syllable
                lastSyllableTime = now;
                
                // Clear previous viseme
                if (currentViseme) {
                    const prevViseme = visemeMorphTargets[currentViseme];
                    if (prevViseme) {
                        prevViseme.mesh.morphTargetInfluences[prevViseme.index] = 0;
                    }
                }
                
                // Select a new viseme from our neutral list
                if (neutralVisemes.length > 0) {
                    const randomIndex = Math.floor(Math.random() * neutralVisemes.length);
                    currentViseme = neutralVisemes[randomIndex];
                    
                    // Apply the new viseme with reduced intensity to avoid exaggerated expressions
                    const viseme = visemeMorphTargets[currentViseme];
                    if (viseme) {
                        // Open mouth with reduced intensity (0.7 instead of 1.0)
                        gsap.to(viseme.mesh.morphTargetInfluences, {
                            [viseme.index]: 0.7, // Reduced intensity
                            duration: syllableDuration * 0.3 / 1000,
                            ease: "power1.out",
                            onComplete: () => {
                                // Hold briefly with even lower intensity
                                gsap.to(viseme.mesh.morphTargetInfluences, {
                                    [viseme.index]: 0.5, // Further reduced
                                    duration: syllableDuration * 0.4 / 1000,
                                    ease: "power1.inOut",
                                    onComplete: () => {
                                        // Close mouth
                                        gsap.to(viseme.mesh.morphTargetInfluences, {
                                            [viseme.index]: 0.1, // Almost closed
                                            duration: syllableDuration * 0.3 / 1000,
                                            ease: "power1.in"
                                        });
                                    }
                                });
                            }
                        });
                    }
                }
                
                // Also animate jaw if available, with reduced movement
                if (jawBone) {
                    const origRot = jawBone.userData.originalRotation;
                    
                    // Open jaw with reduced rotation
                    gsap.to(jawBone.rotation, {
                        x: origRot.x - 0.2, // Reduced from 0.3
                        duration: syllableDuration * 0.3 / 1000,
                        ease: "power1.out",
                        onComplete: () => {
                            // Hold briefly
                            gsap.to(jawBone.rotation, {
                                x: origRot.x - 0.1, // Reduced from 0.15
                                duration: syllableDuration * 0.4 / 1000,
                                ease: "power1.inOut",
                                onComplete: () => {
                                    // Close jaw
                                    gsap.to(jawBone.rotation, {
                                        x: origRot.x - 0.03, // Reduced from 0.05
                                        duration: syllableDuration * 0.3 / 1000,
                                        ease: "power1.in"
                                    });
                                }
                            });
                        }
                    });
                }
            }
            
            // Update audio visualization if debug is on
            if (debugElement.style.display !== 'none') {
                updateAudioVisualization();
            }
        }, 30); // Update at 30ms intervals for smooth animation
    }
    
    // Update audio visualization (for debugging)
    function updateAudioVisualization() {
        if (!audioCanvas || !audioCanvasCtx || !analyser || !dataArray) return;
        
        const width = audioCanvas.width;
        const height = audioCanvas.height;
        
        audioCanvasCtx.clearRect(0, 0, width, height);
        audioCanvasCtx.fillStyle = 'rgb(0, 0, 0)';
        audioCanvasCtx.fillRect(0, 0, width, height);
        
        // Try to get audio data if available
        try {
            analyser.getByteFrequencyData(dataArray);
            
            // Draw frequency data
            const barWidth = (width / dataArray.length) * 2.5;
            let x = 0;
            
            for (let i = 0; i < dataArray.length; i++) {
                const barHeight = (dataArray[i] / 255) * height;
                
                audioCanvasCtx.fillStyle = `rgb(${dataArray[i]}, 50, 50)`;
                audioCanvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        } catch (e) {
            // Fallback to simple visualization
            audioCanvasCtx.fillStyle = 'rgb(50, 200, 50)';
            const barHeight = currentMouthValue * height;
            audioCanvasCtx.fillRect(width/2 - 20, height - barHeight, 40, barHeight);
            
            audioCanvasCtx.fillStyle = 'rgba(200, 50, 50, 0.5)';
            const targetBarHeight = targetMouthValue * height;
            audioCanvasCtx.fillRect(width/2 + 30, height - targetBarHeight, 40, targetBarHeight);
        }
    }
    
    // Set arms to resting position
    function setArmsToRestingPosition() {
        if (leftShoulderBone) {
            const origRot = leftShoulderBone.userData.originalRotation;
            gsap.to(leftShoulderBone.rotation, {
                x: origRot.x + restingPose.leftShoulder.x,
                y: origRot.y + restingPose.leftShoulder.y,
                z: origRot.z + restingPose.leftShoulder.z,
                duration: 1,
                ease: "power2.inOut"
            });
        }
        
        if (rightShoulderBone) {
            const origRot = rightShoulderBone.userData.originalRotation;
            gsap.to(rightShoulderBone.rotation, {
                x: origRot.x + restingPose.rightShoulder.x,
                y: origRot.y + restingPose.rightShoulder.y,
                z: origRot.z + restingPose.rightShoulder.z,
                duration: 1,
                ease: "power2.inOut"
            });
        }
        
        if (leftArmBone) {
            const origRot = leftArmBone.userData.originalRotation;
            gsap.to(leftArmBone.rotation, {
                x: origRot.x + restingPose.leftArm.x,
                y: origRot.y + restingPose.leftArm.y,
                z: origRot.z + restingPose.leftArm.z,
                duration: 1,
                ease: "power2.inOut"
            });
        }
        
        if (rightArmBone) {
            const origRot = rightArmBone.userData.originalRotation;
            gsap.to(rightArmBone.rotation, {
                x: origRot.x + restingPose.rightArm.x,
                y: origRot.y + restingPose.rightArm.y,
                z: origRot.z + restingPose.rightArm.z,
                duration: 1,
                ease: "power2.inOut"
            });
        }
        
        if (leftForearmBone) {
            const origRot = leftForearmBone.userData.originalRotation;
            gsap.to(leftForearmBone.rotation, {
                x: origRot.x + restingPose.leftForearm.x,
                y: origRot.y + restingPose.leftForearm.y,
                z: origRot.z + restingPose.leftForearm.z,
                duration: 1,
                ease: "power2.inOut"
            });
        }
        
        if (rightForearmBone) {
            const origRot = rightForearmBone.userData.originalRotation;
            gsap.to(rightForearmBone.rotation, {
                x: origRot.x + restingPose.rightForearm.x,
                y: origRot.y + restingPose.rightForearm.y,
                z: origRot.z + restingPose.rightForearm.z,
                duration: 1,
                ease: "power2.inOut"
            });
        }
        
        if (leftHandBone) {
            const origRot = leftHandBone.userData.originalRotation;
            gsap.to(leftHandBone.rotation, {
                x: origRot.x + restingPose.leftHand.x,
                y: origRot.y + restingPose.leftHand.y,
                z: origRot.z + restingPose.leftHand.z,
                duration: 1,
                ease: "power2.inOut"
            });
        }
        
        if (rightHandBone) {
            const origRot = rightHandBone.userData.originalRotation;
            gsap.to(rightHandBone.rotation, {
                x: origRot.x + restingPose.rightHand.x,
                y: origRot.y + restingPose.rightHand.y,
                z: origRot.z + restingPose.rightHand.z,
                duration: 1,
                ease: "power2.inOut"
            });
        }
    }
    
    const loader = new THREE.GLTFLoader();
    loader.load(
        modelUrl,
        function(gltf) {
            avatar = gltf.scene;
            
            // Center the avatar in the scene
            avatar.position.set(0, 0.8, 0); // Adjust Y position to be higher
            avatar.scale.set(1, 1, 1);
            scene.add(avatar);

            // Update camera and controls to match new avatar position
            setupCamera();
            loadSpeakingAnimation();
    
            // Adjust skin tone to be more pale/white
            avatar.traverse(function(child) {
                if (child.isMesh && child.material) {
                    // Check if this is likely a skin material by name or color
                    const isSkinMaterial = child.name.toLowerCase().includes('skin') || 
                                        (child.material.name && child.material.name.toLowerCase().includes('skin'));
                    
                    if (isSkinMaterial || isSkinByColor(child.material)) {
                        // Make skin more pale
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.color) {
                                    // Desaturate and lighten the skin tone
                                    const color = mat.color.getHSL({});
                                    // Reduce saturation and increase lightness for pale skin
                                    mat.color.setHSL(
                                        Math.max(0.05, color.h - 0.05), // Slightly reduce hue (move away from red)
                                        Math.max(0.1, color.s * 0.5),   // Reduce saturation by 50%
                                        Math.min(0.9, color.l * 1.3)    // Increase lightness by 30%
                                    );
                                }
                            });
                        } else if (child.material.color) {
                            // Desaturate and lighten the skin tone
                            const color = child.material.color.getHSL({});
                            // Reduce saturation and increase lightness for pale skin
                            child.material.color.setHSL(
                                Math.max(0.05, color.h - 0.05), // Slightly reduce hue (move away from red)
                                Math.max(0.1, color.s * 0.5),   // Reduce saturation by 50%
                                Math.min(0.9, color.l * 1.3)    // Increase lightness by 30%
                            );
                        }
                    }
                }
            });
            
            // Create a skeleton helper for debugging
            if (gltf.animations && gltf.animations.length > 0) {
                debugLog(`Found ${gltf.animations.length} animations`);
                gltf.animations.forEach((anim, index) => {
                    debugLog(`Animation ${index}: ${anim.name}`);
                });
            }
            
            // Log model structuree
            debugModelStructure(avatar);
            
            // Store original rotations and find bones for animation
            storeOriginalRotations(avatar);
            findBonesAndMorphTargets(avatar);
            
            // Add skeleton helper for visualization (if needed)
            if (avatar.children[0] && avatar.children[0].skeleton) {
                skeletonHelper = new THREE.SkeletonHelper(avatar);
                skeletonHelper.visible = false; // Set to true to see skeleton
                scene.add(skeletonHelper);
                debugLog("Skeleton helper added");
            }
            
            // Set arms to natural resting position
            setArmsToRestingPosition();
            
            // Initialize audio context
            initAudioContext();
            
            // Initialize speech synthesis and populate voice selector
            initSpeechSynthesis();
            
            // Hide loading screen
            document.getElementById('loading').style.display = 'none';
            
            // Update status
            updateStatus('Avatar loaded! Type something to make it speak.');
        },
        function(xhr) {
            const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
            document.getElementById('loading').innerHTML = `<div class="loader"></div><p>Loading your avatar... ${percentComplete}%</p>`;
        },
        function(error) {
            console.error('Error loading avatar:', error);
            document.getElementById('loading').innerHTML = 'Error loading avatar. Please check the URL or try again.';
            debugLog(`Error loading: ${error.message}`);
        }
    );

    // Update the camera setup function
function setupCamera() {
// Position camera to look at avatar's face
camera.position.set(0, 1.6, 2);

// Update controls target to avatar's head position
controls.target.set(0, 1.6, 0);

// Lock camera movement
controls.enablePan = false;
controls.enableZoom = true;
controls.minDistance = 1.5;
controls.maxDistance = 3;

// Limit vertical rotation
controls.minPolarAngle = Math.PI/3;
controls.maxPolarAngle = Math.PI/2;

controls.update();
}

// Update the loadSpeakingAnimation function
function loadSpeakingAnimation() {
const animLoader = new THREE.GLTFLoader();
animLoader.load(
    'https://avatar-animations.vercel.app/movements.glb',
    (gltf) => {
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(avatar);
            speakingAnimation = mixer.clipAction(gltf.animations[0]);
            
            // Configure the animation
            speakingAnimation.setLoop(THREE.LoopRepeat);
            speakingAnimation.clampWhenFinished = true;
            speakingAnimation.timeScale = 1;
            
            // Reduce animation intensity and preserve position
            speakingAnimation.weight = 0.7;
            speakingAnimation.enabled = true;
            speakingAnimation.preservePosition = true;
            
            // Lock root motion
            if (avatar.position) {
                avatar.position.y = 0.8; // Keep consistent Y position
                avatar.updateMatrix();
                avatar.matrixAutoUpdate = false; // Prevent automatic position updates
            }
            
            debugLog('Speaking animation loaded successfully');
        }
    },
    undefined,
    (error) => {
        console.error('Error loading speaking animation:', error);
        debugLog('Failed to load speaking animation');
    }
);
}

// Helper function to determine if a material is likely skin by its color
function isSkinByColor(material) {
if (!material.color) return false;

const color = material.color.getHSL({});

// Check if the color is in the range of typical skin tones
// This is a simplified check - skin tones typically have:
// - Hue between 0.02-0.1 (reddish/orangish)
// - Saturation between 0.2-0.6
// - Lightness between 0.4-0.8
return (color.h >= 0.01 && color.h <= 0.12) && 
    (color.s >= 0.15 && color.s <= 0.7) && 
    (color.l >= 0.3 && color.l <= 0.85);
}
    
    // Debug model structure
    function debugModelStructure(model, depth = 0, path = '') {
        if (depth > 10) return; // Prevent infinite recursion
        
        if (depth === 0) {
            debugLog("Model structure:");
        }
        
        const prefix = '  '.repeat(depth);
        const currentPath = path ? `${path}/${model.name}` : model.name;
        
        if (model.isMesh) {
            debugLog(`${prefix}📦 Mesh: ${model.name}`);
            
            if (model.morphTargetDictionary) {
                const morphTargets = Object.keys(model.morphTargetDictionary);
                debugLog(`${prefix}  🎭 MorphTargets: ${morphTargets.join(', ')}`);
            }
        } else if (model.isBone) {
            debugLog(`${prefix}🦴 Bone: ${model.name}`);
        } else if (model.isObject3D) {
        }
        
        if (model.children && model.children.length > 0) {
            model.children.forEach(child => {
                debugModelStructure(child, depth + 1, currentPath);
            });
        }
    }
    
    // Find all bones and morph targets for animation
    function findBonesAndMorphTargets(model) {
        debugLog("Searching for animation bones and morph targets...");
        
        // First check if we have morph targets (blendshapes) for facial animation
        model.traverse(function(object) {
            // Look for morph targets for the face/mouth
            if (object.morphTargetDictionary && object.morphTargetInfluences) {
                debugLog(`Found object with morph targets: ${object.name}`);
                
                // Log all available morph targets
                const morphTargets = Object.keys(object.morphTargetDictionary);
                debugLog(`Available morphs: ${morphTargets.join(", ")}`);
                
                // Find all viseme morph targets
                for (const [key, value] of Object.entries(object.morphTargetDictionary)) {
                    const lowerKey = key.toLowerCase();
                    
                    // Check for visemes
                    if (lowerKey.includes('viseme')) {
                        debugLog(`Found viseme morph target: ${key} at index ${value}`);
                        // Store the mesh and index for this viseme
                        visemeMorphTargets[key] = {
                            mesh: object,
                            index: value
                        };
                    }
                    
                    // Also look for other useful facial expressions
                    if (lowerKey.includes('mouth') || 
                        lowerKey.includes('jaw') || 
                        lowerKey.includes('smile') || 
                        lowerKey.includes('frown') ||
                        lowerKey.includes('blink') ||
                        lowerKey.includes('eye')) {
                        debugLog(`Found facial expression: ${key} at index ${value}`);
                        visemeMorphTargets[key] = {
                            mesh: object,
                            index: value
                        };
                    }
                }
            }
            
            // Find all important bones
            if (object.isBone) {
                const boneName = object.name.toLowerCase();
                
                // Head bone
                if (boneName.includes('head')) {
                    headBone = object;
                    debugLog(`Head bone found: ${object.name}`);
                }
                
                // Jaw bone
                if (boneName.includes('jaw')) {
                    jawBone = object;
                    debugLog(`Jaw bone found: ${object.name}`);
                }
                
                // Neck bone
                if (boneName.includes('neck')) {
                    neckBone = object;
                    debugLog(`Neck bone found: ${object.name}`);
                }
                
                // Spine bone (for body movement)
                if (boneName.includes('spine')) {
                    spineBone = object;
                    debugLog(`Spine bone found: ${object.name}`);
                }
                
                // Eye bones
                if (boneName.includes('eye')) {
                    if (boneName.includes('left')) {
                        leftEyeBone = object;
                        debugLog(`Left eye bone found: ${object.name}`);
                    } else if (boneName.includes('right')) {
                        rightEyeBone = object;
                        debugLog(`Right eye bone found: ${object.name}`);
                    }
                }
                
                // Shoulder, arm and hand bones
                if (boneName.includes('shoulder') || boneName.includes('clavicle')) {
                    if (boneName.includes('left')) {
                        leftShoulderBone = object;
                        debugLog(`Left shoulder bone found: ${object.name}`);
                    } else if (boneName.includes('right')) {
                        rightShoulderBone = object;
                        debugLog(`Right shoulder bone found: ${object.name}`);
                    }
                }
                
                if (boneName.includes('arm') && !boneName.includes('fore')) {
                    if (boneName.includes('left')) {
                        leftArmBone = object;
                        debugLog(`Left arm bone found: ${object.name}`);
                    } else if (boneName.includes('right')) {
                        rightArmBone = object;
                        debugLog(`Right arm bone found: ${object.name}`);
                    }
                }
                
                if (boneName.includes('forearm') || boneName.includes('elbow')) {
                    if (boneName.includes('left')) {
                        leftForearmBone = object;
                        debugLog(`Left forearm bone found: ${object.name}`);
                    } else if (boneName.includes('right')) {
                        rightForearmBone = object;
                        debugLog(`Right forearm bone found: ${object.name}`);
                    }
                }
                
                if (boneName.includes('hand') || boneName.includes('wrist')) {
                    if (boneName.includes('left')) {
                        leftHandBone = object;
                        debugLog(`Left hand bone found: ${object.name}`);
                    } else if (boneName.includes('right')) {
                        rightHandBone = object;
                        debugLog(`Right hand bone found: ${object.name}`);
                    }
                }
            }
        });
        
        // Log animation capabilities
        let animFeatures = [];
        if (headBone) animFeatures.push('head movement');
        if (jawBone) animFeatures.push('jaw movement');
        if (neckBone) animFeatures.push('neck movement');
        if (spineBone) animFeatures.push('body movement');
        if (leftHandBone && rightHandBone) animFeatures.push('hand gestures');
        if (Object.keys(visemeMorphTargets).length > 0) animFeatures.push('facial expressions');
        
        if (animFeatures.length > 0) {
            debugLog(`Animation ready with: ${animFeatures.join(', ')}`);
        } else {
            debugLog("No animation features found - avatar may not animate properly");
            updateStatus('Limited animation available for this avatar');
        }
        
        // Create a virtual jaw bone if none was found
        if (!jawBone && headBone) {
            jawBone = new THREE.Object3D();
            jawBone.name = "VirtualJaw";
            jawBone.position.set(0, -0.1, 0.1);
            headBone.add(jawBone);
            
            jawBone.userData.originalRotation = {
                x: jawBone.rotation.x,
                y: jawBone.rotation.y,
                z: jawBone.rotation.z
            };
            
            debugLog("Created virtual jaw bone");
        }
    }
    
    // Store original bone rotations for resetting
    function storeOriginalRotations(model) {
        model.traverse((node) => {
            if (node.isBone) {
                node.userData.originalRotation = {
                    x: node.rotation.x,
                    y: node.rotation.y,
                    z: node.rotation.z
                };
            }
        });
    }
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        // Update animation mixer
        if (mixer) {
            mixer.update(0.016); // ~60fps
        }
        
        controls.update();
        renderer.render(scene, camera);
    }
    
    animate();
    
    // Handle window resize
    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Text input and speech handling
    const textInput = document.getElementById('text-input');
    const speechBubble = document.getElementById('speech-bubble');
    
    textInput.addEventListener('keypress', async function(event) {
        if (event.key === 'Enter') {
            const text = textInput.value.trim();
            if (text && !speaking) {
                handleConversation(text);
                textInput.value = '';
            }
        }
    });
    
    // Core event listeners
    window.addEventListener('resize', onWindowResize);
    document.getElementById('text-input').addEventListener('keypress', handleKeyPress);
    document.getElementById('test-speech').addEventListener('click', testSpeech);
    
    // Test lip sync function
    function testLipSync() {
        if (!avatar) return;
        debugLog("Testing lip sync");
        
        // Test a sequence of mouth movements
        const timeline = gsap.timeline();
        
        // If we have viseme morph targets, use them
        const visemeKeys = Object.keys(visemeMorphTargets);
        if (visemeKeys.length > 0) {
            // Reset all visemes first
            visemeKeys.forEach(key => {
                const viseme = visemeMorphTargets[key];
                timeline.set(viseme.mesh.morphTargetInfluences, {
                    [viseme.index]: 0
                }, 0);
            });
            
            // Create a sequence of mouth movements with reduced intensity
            const mouthSequence = [
                { value: 0.6, duration: 0.2 },  // Open (reduced from 0.8)
                { value: 0.2, duration: 0.1 },  // Partially close (reduced from 0.3)
                { value: 0.4, duration: 0.15 }, // Medium open (reduced from 0.6)
                { value: 0.1, duration: 0.1 },  // Nearly closed (reduced from 0.2)
                { value: 0.5, duration: 0.2 },  // Open again (reduced from 0.7)
                { value: 0.0, duration: 0.15 }  // Fully closed
            ];
            
            // Find a neutral viseme (avoid smile-related ones)
            let targetViseme;
            for (const key of visemeKeys) {
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('aa') || lowerKey.includes('oh') || lowerKey.includes('m')) {
                    // Skip any smile-related visemes
                    if (!lowerKey.includes('smile') && !lowerKey.includes('happy')) {
                        targetViseme = visemeMorphTargets[key];
                        debugLog(`Using neutral viseme for test: ${key}`);
                        break;
                    }
                }
            }
            
            // If no specific viseme found, use the first one that's not smile-related
            if (!targetViseme) {
                for (const key of visemeKeys) {
                    if (!key.toLowerCase().includes('smile') && 
                        !key.toLowerCase().includes('happy') && 
                        !key.toLowerCase().includes('grin')) {
                        targetViseme = visemeMorphTargets[key];
                        debugLog(`Using fallback viseme for test: ${key}`);
                        break;
                    }
                }
            }
            
            // If still no viseme found, use the first one
            if (!targetViseme && visemeKeys.length > 0) {
                targetViseme = visemeMorphTargets[visemeKeys[0]];
                debugLog(`Using first available viseme: ${visemeKeys[0]}`);
            }
            
            if (targetViseme) {
                let startTime = 0;
                mouthSequence.forEach(step => {
                    timeline.to(targetViseme.mesh.morphTargetInfluences, {
                        [targetViseme.index]: step.value,
                        duration: step.duration,
                        ease: "power1.inOut"
                    }, startTime);
                    startTime += step.duration;
                });
            }
        }
        
        // Also test jaw movement if available with reduced movement
        if (jawBone) {
            const origRot = jawBone.userData.originalRotation;
            
            // Create a sequence of jaw movements with reduced rotation
            const jawSequence = [
                { value: -0.2, duration: 0.2 },  // Open (reduced from -0.3)
                { value: -0.08, duration: 0.1 },  // Partially close (reduced from -0.1)
                { value: -0.15, duration: 0.15 }, // Medium open (reduced from -0.2)
                { value: -0.03, duration: 0.1 }, // Nearly closed (reduced from -0.05)
                { value: -0.18, duration: 0.2 }, // Open again (reduced from -0.25)
                { value: 0, duration: 0.15 }     // Fully closed
            ];
            
            let startTime = 0;
            jawSequence.forEach(step => {
                timeline.to(jawBone.rotation, {
                    x: origRot.x + step.value,
                    duration: step.duration,
                    ease: "power1.inOut"
                }, startTime);
                startTime += step.duration;
            });
        }
    }
    
    // Test animation function
    function testAnimation() {
        if (!avatar) return;
        debugLog("Testing animation");
        
        // Test hand gestures
        testHandGestures();
        
        // Test viseme animations
        const visemeKeys = Object.keys(visemeMorphTargets);
        if (visemeKeys.length > 0) {
            const timeline = gsap.timeline();
            
            // Reset all visemes first
            visemeKeys.forEach(key => {
                const viseme = visemeMorphTargets[key];
                timeline.set(viseme.mesh.morphTargetInfluences, {
                    [viseme.index]: 0
                }, 0);
            });
            
            // Animate through each viseme
            visemeKeys.forEach((key, index) => {
                const viseme = visemeMorphTargets[key];
                timeline.to(viseme.mesh.morphTargetInfluences, {
                    [viseme.index]: 1,
                    duration: 0.3,
                    ease: "power1.inOut",
                    onStart: () => {
                        debugLog(`Testing viseme: ${key}`);
                    }
                });
                timeline.to(viseme.mesh.morphTargetInfluences, {
                    [viseme.index]: 0,
                    duration: 0.3,
                    ease: "power1.inOut"
                });
            });
        }
    }
    
    // Test hand gestures
    function testHandGestures() {
        if (!leftHandBone || !rightHandBone) {
            debugLog("Hand bones not found for gestures");
            return;
        }
        
        // Always start from resting position
        setArmsToRestingPosition();
        
        setTimeout(() => {
            const timeline = gsap.timeline();
            
            // Test each gesture
            handGestures.forEach((gesture, index) => {
                const startTime = index * 2;
                
                // Apply left hand gesture
                if (leftHandBone && leftForearmBone) {
                    // Use resting pose as base position
                    const leftHandOrig = {
                        x: leftHandBone.userData.originalRotation.x + restingPose.leftHand.x,
                        y: leftHandBone.userData.originalRotation.y + restingPose.leftHand.y,
                        z: leftHandBone.userData.originalRotation.z + restingPose.leftHand.z
                    };
                    const leftForearmOrig = {
                        x: leftForearmBone.userData.originalRotation.x + restingPose.leftForearm.x,
                        y: leftForearmBone.userData.originalRotation.y + restingPose.leftForearm.y,
                        z: leftForearmBone.userData.originalRotation.z + restingPose.leftForearm.z
                    };
                    
                    timeline.to(leftHandBone.rotation, {
                        x: leftHandOrig.x + gesture.leftHand.rotation.x,
                        y: leftHandOrig.y + gesture.leftHand.rotation.y,
                        z: leftHandOrig.z + gesture.leftHand.rotation.z,
                        duration: 0.5,
                        ease: "power1.out"
                    }, startTime);
                    
                    timeline.to(leftForearmBone.rotation, {
                        x: leftForearmOrig.x + gesture.leftHand.forearm.x,
                        y: leftForearmOrig.y + gesture.leftHand.forearm.y,
                        z: leftForearmOrig.z + gesture.leftHand.forearm.z,
                        duration: 0.5,
                        ease: "power1.out"
                    }, startTime);
                }
                
                // Apply right hand gesture
                if (rightHandBone && rightForearmBone) {
                    // Use resting pose as base position
                    const rightHandOrig = {
                        x: rightHandBone.userData.originalRotation.x + restingPose.rightHand.x,
                        y: rightHandBone.userData.originalRotation.y + restingPose.rightHand.y,
                        z: rightHandBone.userData.originalRotation.z + restingPose.rightHand.z
                    };
                    const rightForearmOrig = {
                        x: rightForearmBone.userData.originalRotation.x + restingPose.rightForearm.x,
                        y: rightForearmBone.userData.originalRotation.y + restingPose.rightForearm.y,
                        z: rightForearmBone.userData.originalRotation.z + restingPose.rightForearm.z
                    };
                    
                    timeline.to(rightHandBone.rotation, {
                        x: rightHandOrig.x + gesture.rightHand.rotation.x,
                        y: rightHandOrig.y + gesture.rightHand.rotation.y,
                        z: rightHandOrig.z + gesture.rightHand.rotation.z,
                        duration: 0.5,
                        ease: "power1.out"
                    }, startTime);
                    
                    timeline.to(rightForearmBone.rotation, {
                        x: rightForearmOrig.x + gesture.rightHand.forearm.x,
                        y: rightForearmOrig.y + gesture.rightHand.forearm.y,
                        z: rightForearmOrig.z + gesture.rightHand.forearm.z,
                        duration: 0.5,
                        ease: "power1.out"
                    }, startTime);
                }
                
                // Hold the gesture
                timeline.to({}, {
                    duration: 1,
                    onStart: () => {
                        debugLog(`Testing gesture: ${gesture.name}`);
                    }
                }, startTime + 0.5);
                
                // Return to resting position
                timeline.call(() => {
                    setArmsToRestingPosition();
                }, [], startTime + 1.5);
            });
        }, 500); // Wait a bit for the initial resting pose to complete
    }
    
    // Animation and gesture functionality
    function initializeAnimations() {
        if (!avatar) return;
        
        const timeline = gsap.timeline();
        setArmsToRestingPosition();
        
        // Initialize any necessary animation states
        if (visemeMorphTargets) {
            const visemeKeys = Object.keys(visemeMorphTargets);
            visemeKeys.forEach(key => {
                const viseme = visemeMorphTargets[key];
                timeline.set(viseme.mesh.morphTargetInfluences, {
                    [viseme.index]: 0
                }, 0);
            });
        }
    }
    
    // Apply a random hand gesture from resting position
    function applyRandomHandGesture() {
        if (!leftHandBone || !rightHandBone) return null;
        
        // Select a random gesture
        const gesture = handGestures[Math.floor(Math.random() * handGestures.length)];
        debugLog(`Applying hand gesture: ${gesture.name}`);
        
        const timeline = gsap.timeline();
        
        // Apply left hand gesture
        if (leftHandBone && leftForearmBone) {
            // Use resting pose as base position
            const leftHandOrig = {
                x: leftHandBone.userData.originalRotation.x + restingPose.leftHand.x,
                y: leftHandBone.userData.originalRotation.y + restingPose.leftHand.y,
                z: leftHandBone.userData.originalRotation.z + restingPose.leftHand.z
            };
            const leftForearmOrig = {
                x: leftForearmBone.userData.originalRotation.x + restingPose.leftForearm.x,
                y: leftForearmBone.userData.originalRotation.y + restingPose.leftForearm.y,
                z: leftForearmBone.userData.originalRotation.z + restingPose.leftForearm.z
            };
            
            timeline.to(leftHandBone.rotation, {
                x: leftHandOrig.x + gesture.leftHand.rotation.x,
                y: leftHandOrig.y + gesture.leftHand.rotation.y,
                z: leftHandOrig.z + gesture.leftHand.rotation.z,
                duration: 0.5,
                ease: "power1.out"
            });
            
            timeline.to(leftForearmBone.rotation, {
                x: leftForearmOrig.x + gesture.leftHand.forearm.x,
                y: leftForearmOrig.y + gesture.leftHand.forearm.y,
                z: leftForearmOrig.z + gesture.leftHand.forearm.z,
                duration: 0.5,
                ease: "power1.out"
            }, "<");
        }
        
        // Apply right hand gesture
        if (rightHandBone && rightForearmBone) {
            // Use resting pose as base position
            const rightHandOrig = {
                x: rightHandBone.userData.originalRotation.x + restingPose.rightHand.x,
               
                y: rightHandBone.userData.originalRotation.y + restingPose.rightHand.y,
                z: rightHandBone.userData.originalRotation.z + restingPose.rightHand.z
            };
            const rightForearmOrig = {
                x: rightForearmBone.userData.originalRotation.x + restingPose.rightForearm.x,
                y: rightForearmBone.userData.originalRotation.y + restingPose.rightForearm.y,
                z: rightForearmBone.userData.originalRotation.z + restingPose.rightForearm.z
            };
            
            timeline.to(rightHandBone.rotation, {
                x: rightHandOrig.x + gesture.rightHand.rotation.x,
                y: rightHandOrig.y + gesture.rightHand.rotation.y,
                z: rightHandOrig.z + gesture.rightHand.rotation.z,
                duration: 0.5,
                ease: "power1.out"
            }, "<");
            
            timeline.to(rightForearmBone.rotation, {
                x: rightForearmOrig.x + gesture.rightHand.forearm.x,
                y: rightForearmOrig.y + gesture.rightHand.forearm.y,
                z: rightForearmOrig.z + gesture.rightHand.forearm.z,
                duration: 0.5,
                ease: "power1.out"
            }, "<");
        }
        
        return timeline;
    }
    
    // Add a sequence of hand gestures during speech
    function addHandGestureSequence(timeline, duration) {
        if (!leftHandBone || !rightHandBone) return;
        
        // Create a sequence of gestures throughout the speech
        const gestureCount = Math.max(2, Math.floor(duration / 3));
        
        // Start with resting position
        timeline.call(() => {
            setArmsToRestingPosition();
        }, [], 0);
        
        for (let i = 0; i < gestureCount; i++) {
            const startTime = i * 3 + 1; // Change gesture every 3 seconds, starting after 1 second
            const gesture = handGestures[Math.floor(Math.random() * handGestures.length)];
            
            // Apply left hand gesture
            if (leftHandBone && leftForearmBone) {
                // Use resting pose as base position
                const leftHandOrig = {
                    x: leftHandBone.userData.originalRotation.x + restingPose.leftHand.x,
                    y: leftHandBone.userData.originalRotation.y + restingPose.leftHand.y,
                    z: leftHandBone.userData.originalRotation.z + restingPose.leftHand.z
                };
                const leftForearmOrig = {
                    x: leftForearmBone.userData.originalRotation.x + restingPose.leftForearm.x,
                    y: leftForearmBone.userData.originalRotation.y + restingPose.leftForearm.y,
                    z: leftForearmBone.userData.originalRotation.z + restingPose.leftForearm.z
                };
                
                timeline.to(leftHandBone.rotation, {
                    x: leftHandOrig.x + gesture.leftHand.rotation.x,
                    y: leftHandOrig.y + gesture.leftHand.rotation.y,
                    z: leftHandOrig.z + gesture.leftHand.rotation.z,
                    duration: 0.7,
                    ease: "power1.out"
                }, startTime);
                
                timeline.to(leftForearmBone.rotation, {
                    x: leftForearmOrig.x + gesture.leftHand.forearm.x,
                    y: leftForearmOrig.y + gesture.leftHand.forearm.y,
                    z: leftForearmOrig.z + gesture.leftHand.forearm.z,
                    duration: 0.7,
                    ease: "power1.out"
                }, startTime);
                
                // Add subtle movement during the gesture hold
                timeline.to(leftHandBone.rotation, {
                    x: leftHandOrig.x + gesture.leftHand.rotation.x + (Math.random() - 0.5) * 0.05,
                    y: leftHandOrig.y + gesture.leftHand.rotation.y + (Math.random() - 0.5) * 0.05,
                    z: leftHandOrig.z + gesture.leftHand.rotation.z + (Math.random() - 0.5) * 0.05,
                    duration: 0.8,
                    ease: "power1.inOut"
                }, startTime + 0.7);
                
                timeline.to(leftForearmBone.rotation, {
                    x: leftForearmOrig.x + gesture.leftHand.forearm.x + (Math.random() - 0.5) * 0.03,
                    y: leftForearmOrig.y + gesture.leftHand.forearm.y + (Math.random() - 0.5) * 0.03,
                    z: leftForearmOrig.z + gesture.leftHand.forearm.z + (Math.random() - 0.5) * 0.03,
                    duration: 0.8,
                    ease: "power1.inOut"
                }, startTime + 0.7);
            }
            
            // Apply right hand gesture
            if (rightHandBone && rightForearmBone) {
                // Use resting pose as base position
                const rightHandOrig = {
                    x: rightHandBone.userData.originalRotation.x + restingPose.rightHand.x,
                    y: rightHandBone.userData.originalRotation.y + restingPose.rightHand.y,
                    z: rightHandBone.userData.originalRotation.z + restingPose.rightHand.z
                };
                const rightForearmOrig = {
                    x: rightForearmBone.userData.originalRotation.x + restingPose.rightForearm.x,
                    y: rightForearmBone.userData.originalRotation.y + restingPose.rightForearm.y,
                    z: rightForearmBone.userData.originalRotation.z + restingPose.rightForearm.z
                };
                
                timeline.to(rightHandBone.rotation, {
                    x: rightHandOrig.x + gesture.rightHand.rotation.x,
                    y: rightHandOrig.y + gesture.rightHand.rotation.y,
                    z: rightHandOrig.z + gesture.rightHand.rotation.z,
                    duration: 0.7,
                    ease: "power1.out"
                }, startTime);
                
                timeline.to(rightForearmBone.rotation, {
                    x: rightForearmOrig.x + gesture.rightHand.forearm.x,
                    y: rightForearmOrig.y + gesture.rightHand.forearm.y,
                    z: rightForearmOrig.z + gesture.rightHand.forearm.z,
                    duration: 0.7,
                    ease: "power1.out"
                }, startTime);
                
                // Add subtle movement during the gesture hold
                timeline.to(rightHandBone.rotation, {
                    x: rightHandOrig.x + gesture.rightHand.rotation.x + (Math.random() - 0.5) * 0.05,
                    y: rightHandOrig.y + gesture.rightHand.rotation.y + (Math.random() - 0.5) * 0.05,
                    z: rightHandOrig.z + gesture.rightHand.rotation.z + (Math.random() - 0.5) * 0.05,
                    duration: 0.8,
                    ease: "power1.inOut"
                }, startTime + 0.7);
                
                timeline.to(rightForearmBone.rotation, {
                    x: rightForearmOrig.x + gesture.rightHand.forearm.x + (Math.random() - 0.5) * 0.03,
                    y: rightForearmOrig.y + gesture.rightHand.forearm.y + (Math.random() - 0.5) * 0.03,
                    z: rightForearmOrig.z + gesture.rightHand.forearm.z + (Math.random() - 0.5) * 0.03,
                    duration: 0.8,
                    ease: "power1.inOut"
                }, startTime + 0.7);
            }
            
            // Return to resting position
            timeline.call(() => {
                setArmsToRestingPosition();
            }, [], startTime + 2.5);
        }
    }
    
    function addNaturalMovements(timeline, duration) {
        // Add subtle head movements
        if (headBone) {
            const origRot = headBone.userData.originalRotation;
            
            // Initial slight tilt
            timeline.to(headBone.rotation, {
                x: origRot.x + (Math.random() * 0.05 - 0.025),
                y: origRot.y + (Math.random() * 0.1 - 0.05),
                z: origRot.z + (Math.random() * 0.05 - 0.025),
                duration: 0.8,
                ease: "power1.inOut"
            }, 0);
            
            // Add several subtle movements throughout the speech
            const moveCount = Math.max(3, Math.floor(duration / 2));
            
            for (let i = 0; i < moveCount; i++) {
                const startTime = (i + 1) * (duration / moveCount);
                
                timeline.to(headBone.rotation, {
                    x: origRot.x + (Math.random() * 0.1 - 0.05),
                    y: origRot.y + (Math.random() * 0.15 - 0.075),
                    z: origRot.z + (Math.random() * 0.08 - 0.04),
                    duration: 1.2,
                    ease: "power1.inOut"
                }, startTime);
            }
            
            // Return to original position at the end
            timeline.to(headBone.rotation, {
                x: origRot.x,
                y: origRot.y,
                z: origRot.z,
                duration: 0.8,
                ease: "power1.inOut"
            }, duration - 0.5);
        }
        
        // Add subtle neck movements
        if (neckBone) {
            const origRot = neckBone.userData.originalRotation;
            
            // Initial slight movement
            timeline.to(neckBone.rotation, {
                x: origRot.x + (Math.random() * 0.03 - 0.015),
                y: origRot.y + (Math.random() * 0.06 - 0.03),
                z: origRot.z + (Math.random() * 0.03 - 0.015),
                duration: 0.8,
                ease: "power1.inOut"
            }, 0);
            
            // Add several subtle movements throughout the speech
            const moveCount = Math.max(3, Math.floor(duration / 2));
            
            for (let i = 0; i < moveCount; i++) {
                const startTime = (i + 1) * (duration / moveCount) + 0.2; // Slight delay after head
                
                timeline.to(neckBone.rotation, {
                    x: origRot.x + (Math.random() * 0.06 - 0.03),
                    y: origRot.y + (Math.random() * 0.08 - 0.04),
                    z: origRot.z + (Math.random() * 0.04 - 0.02),
                    duration: 1.2,
                    ease: "power1.inOut"
                }, startTime);
            }
            
            // Return to original position at the end
            timeline.to(neckBone.rotation, {
                x: origRot.x,
                y: origRot.y,
                z: origRot.z,
                duration: 0.8,
                ease: "power1.inOut"
            }, duration - 0.3);
        }
        
        // Add very subtle spine movements
        if (spineBone) {
            const origRot = spineBone.userData.originalRotation;
            
            // Initial slight movement
            timeline.to(spineBone.rotation, {
                x: origRot.x + (Math.random() * 0.02 - 0.01),
                y: origRot.y + (Math.random() * 0.04 - 0.02),
                z: origRot.z + (Math.random() * 0.02 - 0.01),
                duration: 1,
                ease: "power1.inOut"
            }, 0.2);
            
            // Add a few subtle movements throughout the speech
            const moveCount = Math.max(2, Math.floor(duration / 3));
            
            for (let i = 0; i < moveCount; i++) {
                const startTime = (i + 1) * (duration / moveCount) + 0.4; // Slight delay after neck
                
                timeline.to(spineBone.rotation, {
                    x: origRot.x + (Math.random() * 0.03 - 0.015),
                    y: origRot.y + (Math.random() * 0.05 - 0.025),
                    z: origRot.z + (Math.random() * 0.03 - 0.015),
                    duration: 1.5,
                    ease: "power1.inOut"
                }, startTime);
            }
            
            // Return to original position at the end
            timeline.to(spineBone.rotation, {
                x: origRot.x,
                y: origRot.y,
                z: origRot.z,
                duration: 1,
                ease: "power1.inOut"
            }, duration - 0.2);
        }
        
        return timeline;
    }

    // Add a function to update status display
    function updateStatus(message) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = `Status: ${message}`;
    }

    // Add a function to reset avatar to default pose
    function resetAvatarToDefault() {
        if (!avatar) return;
        
        // Reset all bones to their original rotations
        avatar.traverse((node) => {
            if (node.isBone && node.userData.originalRotation) {
                gsap.to(node.rotation, {
                    x: node.userData.originalRotation.x,
                    y: node.userData.originalRotation.y,
                    z: node.userData.originalRotation.z,
                    duration: 0.5,
                    ease: "power1.out"
                });
            }
        });
        
        // Reset all visemes
        for (const key in visemeMorphTargets) {
            const viseme = visemeMorphTargets[key];
            if (viseme && viseme.mesh) {
                gsap.to(viseme.mesh.morphTargetInfluences, {
                    [viseme.index]: 0,
                    duration: 0.3
                });
            }
        }
        
        updateStatus('Avatar reset to default pose');
    }

    // Update the audio analysis setup in handleConversation
    async function setupAudioAnalysis(audio) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256; // Smaller size for faster processing
            analyser.smoothingTimeConstant = 0.8; // Smooth transitions
            
            audioSource = audioContext.createMediaElementSource(audio);
            audioSource.connect(analyser);
            audioSource.connect(audioContext.destination);
            
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            // Start lip sync animation
            function animateLipSync() {
                if (speaking) {
                    updateLipSync(analyser, dataArray, jawBone, visemeMorphTargets);
                    requestAnimationFrame(animateLipSync);
                } else {
                    // Reset mouth to closed position
                    if (jawBone) {
                        const origRot = jawBone.userData.originalRotation;
                        jawBone.rotation.x = origRot.x;
                    }
                    
                    for (const key in visemeMorphTargets) {
                        const viseme = visemeMorphTargets[key];
                        if (viseme) {
                            viseme.mesh.morphTargetInfluences[viseme.index] = 0;
                        }
                    }
                }
            }
            
            animateLipSync();
            debugLog('Audio analysis and lip sync setup complete');
        } catch (error) {
            console.error('Error setting up audio analysis:', error);
            debugLog(`Audio analysis setup failed: ${error.message}`);
            throw new Error('Failed to setup audio analysis');
        }
    }

    // Update the cleanup function
    function cleanupAudioAnalysis() {
        speaking = false; // This will stop the lip sync animation
        
        if (audioSource) {
            try {
                audioSource.disconnect();
            } catch (error) {
                console.warn('Error disconnecting audio source:', error);
            }
            audioSource = null;
        }
        
        if (audioContext) {
            try {
                audioContext.close();
                audioContext = null;
            } catch (error) {
                console.warn('Error closing audio context:', error);
            }
        }
        
        if (analyser) {
            analyser = null;
        }
        
        // Reset mouth position
        if (jawBone) {
            const origRot = jawBone.userData.originalRotation;
            jawBone.rotation.x = origRot.x;
        }
        
        for (const key in visemeMorphTargets) {
            const viseme = visemeMorphTargets[key];
            if (viseme) {
                viseme.mesh.morphTargetInfluences[viseme.index] = 0;
            }
        }
    }

    // Format text for display by converting markdown to proper formatting
    function formatTextForDisplay(text) {
        return text
            .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markers but keep text
            .replace(/\*([^*]+)\*/g, '$1')     // Remove italic markers but keep text
            .replace(/_([^_]+)_/g, '$1')       // Remove underscore emphasis but keep text
            .replace(/`([^`]+)`/g, '$1')       // Remove code markers but keep text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace [text](link) with just text
            .replace(/#{1,6}\s/g, '')          // Remove heading markers
            .replace(/\n\s*\*/g, '\n• ')       // Convert list asterisks to bullet points
            .replace(/\n/g, '<br>')            // Convert newlines to HTML breaks
            .trim();                           // Remove leading/trailing whitespace
    }

    // Update the conversation handler to use formatted text
    async function handleConversation(userInput) {
        if (!userInput || speaking) return;

        try {
            speaking = true;
            updateStatus('Processing response...');
            
            // Show thinking state
            speechBubble.textContent = "Thinking...";
            speechBubble.style.opacity = 1;
            
            // Get response from Gemini
            const aiResponse = await getGeminiResponse(userInput);
            
            if (aiResponse) {
                updateStatus('Converting to speech...');
                
                try {
                    // Generate speech from Eleven Labs with cleaned text
                    const speechResponse = await generateSpeech(aiResponse);
                    if (!speechResponse.ok) {
                        throw new Error(`Eleven Labs API error: ${speechResponse.status}`);
                    }
                    
                    // Convert response to audio blob
                    const audioBlob = await speechResponse.blob();
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = new Audio(audioUrl);
                    
                    // Set up audio handling
                    await setupAudioAnalysis(audio);
                    
                    // Update speech bubble with formatted text
                    const formattedText = formatTextForDisplay(aiResponse);
                    speechBubble.innerHTML = formattedText; // Using innerHTML to render HTML breaks
                    
                    // Wait for audio to be ready before starting animation
                    audio.addEventListener('canplaythrough', () => {
                        // Start speaking animation only when audio starts playing
                        if (speakingAnimation) {
                            speakingAnimation.reset();
                            speakingAnimation.play();
                        }
                        
                        // Estimate duration for animations
                        const wordCount = aiResponse.split(/\s+/).length;
                        const estimatedDuration = (wordCount / 2) + (aiResponse.length / 15);
                        
                        // Set up animations
                        const timeline = gsap.timeline();
                        addNaturalMovements(timeline, estimatedDuration);
                        addHandGestureSequence(timeline, estimatedDuration);
                    });
                    
                    // Play audio
                    await audio.play();
                    
                    // Handle audio end
                    audio.onended = () => {
                        speaking = false;
                        speechBubble.style.opacity = 0;
                        setArmsToRestingPosition();
                        cleanupAudioAnalysis();
                        
                        // Stop speaking animation
                        if (speakingAnimation) {
                            speakingAnimation.stop();
                        }
                        
                        updateStatus('Ready');
                        URL.revokeObjectURL(audioUrl);
                    };
                } catch (error) {
                    console.error('Speech generation error:', error);
                    showError(`Speech synthesis failed: ${error.message}`);
                    speaking = false;
                    speechBubble.style.opacity = 0;
                    updateStatus('Error occurred');
                }
            }
        } catch (error) {
            console.error('Conversation error:', error);
            showError(`Conversation error: ${error.message}`);
            speaking = false;
            updateStatus('Error occurred');
            cleanupAudioAnalysis();
        }
    }

    // Add this test function
    async function testSpeech() {
        try {
            updateStatus('Testing speech...');
            const response = await generateSpeech("Hello, this is a test message.");
            console.log('Got speech response');
            
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            audio.onended = () => {
                updateStatus('Test complete');
                URL.revokeObjectURL(audioUrl);
            };
            
            audio.onerror = (e) => {
                console.error('Audio playback error:', e);
                updateStatus('Test failed');
            };
            
            await audio.play();
            updateStatus('Playing test audio...');
        } catch (error) {
            console.error('Test speech failed:', error);
            showError(`Speech test failed: ${error.message}`);
            updateStatus('Test failed');
        }
    }

    // Add a test button to your controls div
    document.getElementById('controls').innerHTML += `
        <button id="test-speech" class="control-button">Test Speech</button>
    `;

    document.getElementById('test-speech').addEventListener('click', testSpeech);

    // Add these variables at the top with your other declarations
// let mixer;
// let speakingAnimation;

    // Add this function to load and set up the animation
    function loadSpeakingAnimation() {
        const animLoader = new THREE.GLTFLoader();
        animLoader.load(
            'https://avatar-animations.vercel.app/movements.glb',
            (gltf) => {
                if (gltf.animations && gltf.animations.length > 0) {
                    // Create animation mixer
                    mixer = new THREE.AnimationMixer(avatar);
                    
                    // Get the first animation
                    speakingAnimation = mixer.clipAction(gltf.animations[0]);
                    
                    // Configure the animation
                    speakingAnimation.setLoop(THREE.LoopRepeat);
                    speakingAnimation.clampWhenFinished = true;
                    speakingAnimation.timeScale = 1;
                    
                    // Reduce animation intensity to prevent camera movement
                    speakingAnimation.weight = 0.7; // Reduce the animation strength
                    
                    // Preserve initial position
                    speakingAnimation.preservePosition = true;  // Add this line
                    
                    debugLog('Speaking animation loaded successfully');
                }
            },
            undefined,
            (error) => {
                console.error('Error loading speaking animation:', error);
                debugLog('Failed to load speaking animation');
            }
        );
    }

    // Call this function to start the speaking animation
    function playSpeakingAnimation() {
        if (speakingAnimation) {
            speakingAnimation.reset();
            speakingAnimation.play();
            debugLog('Playing speaking animation');
        }
    }

    // Stop the speaking animation
    function stopSpeakingAnimation() {
        if (speakingAnimation) {
            speakingAnimation.stop();
            debugLog('Stopped speaking animation');
        }
    }

    // Update the speak function to include animation
    async function speak(text) {
        if (!text || speaking) return;

        speaking = true;
        updateStatus('Speaking...');

        try {
            speechBubble.textContent = text;
            speechBubble.style.opacity = 1;
            
            const response = await generateSpeech(text);
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // Set up audio handling
            await setupAudioAnalysis(audio);
            
            // Play speaking animation
            playSpeakingAnimation();
            
            // Estimate duration and set up animations
            const wordCount = text.split(/\s+/).length;
            const estimatedDuration = (wordCount / 2) + (text.length / 15);
            
            const timeline = gsap.timeline();
            addNaturalMovements(timeline, estimatedDuration);
            addHandGestureSequence(timeline, estimatedDuration);
            
            // Play audio with proper error handling
            audio.onerror = (e) => {
                console.error('Audio playback error:', e);
                speaking = false;
                updateStatus('Audio playback failed');
                speechBubble.style.opacity = 0;
            };
            
            audio.oncanplay = () => {
                audio.play().catch(error => {
                    console.error('Audio play error:', error);
                    speaking = false;
                    updateStatus('Failed to play audio');
                });
            };
            
            audio.onended = () => {
                speaking = false;
                speechBubble.style.opacity = 0;
                setArmsToRestingPosition();
                cleanupAudioAnalysis();
                updateStatus('Ready');
                URL.revokeObjectURL(audioUrl); // Clean up the URL
            };
            
        } catch (error) {
            console.error('Speech error:', error);
            showError(`Speech synthesis failed: ${error.message}`);
            speaking = false;
            speechBubble.style.opacity = 0;
            updateStatus('Error occurred');
        }
    }

    // Load the 3D model
    function loadModel() {
        const loader = new THREE.GLTFLoader();
        const loadingManager = new THREE.LoadingManager();
        
        loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
            const progress = (itemsLoaded / itemsTotal * 100).toFixed(2);
            document.getElementById('status').textContent = `Loading: ${progress}%`;
        };

        loadingManager.onLoad = function() {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('status').textContent = 'Ready';
        };

        loader.setManager(loadingManager);
        loader.load(
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/RiggedSimple/glTF/RiggedSimple.gltf',
            function(gltf) {
                model = gltf.scene;
                
                // Center the model
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                
                // Calculate scale to make avatar a reasonable height (e.g., 1.7 units tall)
                const targetHeight = 1.7;
                const scale = targetHeight / size.y;
                model.scale.setScalar(scale);
                
                // Position the model so it's standing on the ground
                model.position.y = 0;
                model.position.x = 0;
                model.position.z = 0;
                
                scene.add(model);

                // Set up animations
                mixer = new THREE.AnimationMixer(model);
                const animations = gltf.animations;
                if (animations && animations.length) {
                    currentAnimation = mixer.clipAction(animations[0]);
                    currentAnimation.play();
                }

                // Initialize audio context
                initAudio();
                
                // Update controls target
                controls.target.set(0, targetHeight / 2, 0);
                controls.update();
            },
            undefined,
            function(error) {
                console.error('Error loading model:', error);
                showError('Failed to load 3D model. Please refresh the page.');
            }
        );
    }

    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    document.getElementById('text-input').addEventListener('keypress', handleKeyPress);
    document.getElementById('test-speech').addEventListener('click', testSpeech);
