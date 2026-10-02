function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState,
  useEffect,
  useRef,
  useCallback
} = React;
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
async function deriveStrongHash(password, saltBytes, iterations) {
  const enc = new TextEncoder();
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const iter = iterations || 100000;
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: iter,
    hash: 'SHA-256'
  }, keyMaterial, 256);
  const b64 = arr => btoa(String.fromCharCode.apply(null, new Uint8Array(arr)));
  return `pbkdf2$${iter}$${b64(salt)}$${b64(bits)}`;
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
const PUBLIC_PROFILE_COLUMNS = 'session_id,nickname,bio,starseed_type,avatar,country,interests,experience_level,telepathy_score,telepathy_best,show_telepathy_score';
const Star = props => React.createElement("svg", _extends({}, props, {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}), React.createElement("polygon", {
  points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
}));
const Brain = props => React.createElement("svg", _extends({}, props, {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}), React.createElement("path", {
  d: "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"
}), React.createElement("path", {
  d: "M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"
}));
const Send = props => React.createElement("svg", _extends({}, props, {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}), React.createElement("line", {
  x1: "22",
  y1: "2",
  x2: "11",
  y2: "13"
}), React.createElement("polygon", {
  points: "22 2 15 22 11 13 2 9 22 2"
}));
const Calendar = props => React.createElement("svg", _extends({}, props, {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}), React.createElement("rect", {
  x: "3",
  y: "4",
  width: "18",
  height: "18",
  rx: "2",
  ry: "2"
}), React.createElement("line", {
  x1: "16",
  y1: "2",
  x2: "16",
  y2: "6"
}), React.createElement("line", {
  x1: "8",
  y1: "2",
  x2: "8",
  y2: "6"
}), React.createElement("line", {
  x1: "3",
  y1: "10",
  x2: "21",
  y2: "10"
}));
const Users = props => React.createElement("svg", _extends({}, props, {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2"
}), React.createElement("path", {
  d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
}), React.createElement("circle", {
  cx: "9",
  cy: "7",
  r: "4"
}), React.createElement("path", {
  d: "M23 21v-2a4 4 0 0 0-3-3.87"
}), React.createElement("path", {
  d: "M16 3.13a4 4 0 0 1 0 7.75"
}));
const telepathySymbols = [{
  id: 'star',
  icon: '⭐',
  name: 'Star'
}, {
  id: 'sun',
  name: 'Sun',
  icon: React.createElement("svg", {
    viewBox: "0 0 24 24",
    style: {
      width: '1em',
      height: '1em',
      verticalAlign: 'middle'
    },
    "aria-hidden": "true"
  }, React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "5",
    fill: "#fcd34d"
  }), React.createElement("g", {
    stroke: "#fcd34d",
    strokeWidth: "2.2",
    strokeLinecap: "round"
  }, React.createElement("line", {
    x1: "12",
    y1: "1.5",
    x2: "12",
    y2: "4.2"
  }), React.createElement("line", {
    x1: "12",
    y1: "19.8",
    x2: "12",
    y2: "22.5"
  }), React.createElement("line", {
    x1: "1.5",
    y1: "12",
    x2: "4.2",
    y2: "12"
  }), React.createElement("line", {
    x1: "19.8",
    y1: "12",
    x2: "22.5",
    y2: "12"
  }), React.createElement("line", {
    x1: "4.4",
    y1: "4.4",
    x2: "6.3",
    y2: "6.3"
  }), React.createElement("line", {
    x1: "17.7",
    y1: "17.7",
    x2: "19.6",
    y2: "19.6"
  }), React.createElement("line", {
    x1: "4.4",
    y1: "19.6",
    x2: "6.3",
    y2: "17.7"
  }), React.createElement("line", {
    x1: "17.7",
    y1: "6.3",
    x2: "19.6",
    y2: "4.4"
  })))
}, {
  id: 'moon',
  icon: '🌙',
  name: 'Moon'
}, {
  id: 'heart',
  icon: '💜',
  name: 'Heart'
}, {
  id: 'eye',
  icon: '👁️',
  name: 'Eye'
}, {
  id: 'infinity',
  icon: '∞',
  name: 'Infinity'
}, {
  id: 'water',
  icon: '💧',
  name: 'Water'
}, {
  id: 'fire',
  icon: '🔥',
  name: 'Fire'
}, {
  id: 'crystalball',
  icon: '🔮',
  name: 'Crystal Ball'
}];
const telepathyNumbers = [{
  id: 'n1',
  icon: '1',
  name: '1'
}, {
  id: 'n2',
  icon: '2',
  name: '2'
}, {
  id: 'n3',
  icon: '3',
  name: '3'
}, {
  id: 'n4',
  icon: '4',
  name: '4'
}, {
  id: 'n5',
  icon: '5',
  name: '5'
}, {
  id: 'n6',
  icon: '6',
  name: '6'
}, {
  id: 'n7',
  icon: '7',
  name: '7'
}, {
  id: 'n8',
  icon: '8',
  name: '8'
}, {
  id: 'n9',
  icon: '9',
  name: '9'
}];
const telepathyWords = [{
  id: 'A',
  icon: 'A',
  name: 'A'
}, {
  id: 'B',
  icon: 'B',
  name: 'B'
}, {
  id: 'C',
  icon: 'C',
  name: 'C'
}, {
  id: 'D',
  icon: 'D',
  name: 'D'
}, {
  id: 'E',
  icon: 'E',
  name: 'E'
}, {
  id: 'F',
  icon: 'F',
  name: 'F'
}];
const GUEST_ADJ = ['aurora', 'lunare', 'solare', 'stellare', 'cosmico', 'astrale', 'etereo', 'mistico', 'radioso', 'sereno', 'profondo', 'arcano', 'celeste', 'lucente', 'eterno', 'sacro', 'antico', 'divino', 'nebuloso', 'boreale'];
const GUEST_ANIMAL = ['lince', 'cervo', 'lupo', 'falco', 'gufo', 'volpe', 'airone', 'delfino', 'cigno', 'pantera', 'colibri', 'fenice', 'aquila', 'leone', 'tigre', 'orca', 'corvo', 'ibis', 'drago', 'gazzella'];
const makeGuestCode = () => {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  return `${pick(GUEST_ADJ)}-${pick(GUEST_ANIMAL)}-${1000 + Math.floor(Math.random() * 9000)}`;
};
const ritualTypes = [{
  id: 'consciousness',
  name: 'Consciousness Elevation',
  icon: '🧠'
}, {
  id: 'dna',
  name: 'DNA Activation',
  icon: '🧬'
}, {
  id: 'lightbody',
  name: 'Light Body Activation',
  icon: '✨'
}, {
  id: 'unity',
  name: 'Unity Consciousness',
  icon: '🤝'
}, {
  id: 'ascension',
  name: 'Ascension Portal',
  icon: '🌅'
}];
const sacredNumbers = [1, 3, 7, 9, 11, 22, 33, 44, 108];
const translations = {
  en: {
    title: "Global Awakening",
    subtitle: "Unite in Light, Awaken as One",
    enterPlatform: "Enter Platform",
    enterAsGuest: "Enter as Guest",
    login: "Login",
    register: "Register",
    passwordOptional: "Password (optional)",
    emailPlaceholder: "Email address",
    usernamePlaceholder: "Choose username...",
    invalidCredentials: "Email or password not correct",
    tooManyAttempts: "Too many attempts, try again in a few minutes",
    emailAlreadyUsed: "This email is already registered",
    usernameAlreadyUsed: "This username is already taken",
    fillAllFields: "Please fill in all fields",
    invalidEmail: "Please enter a valid email address",
    connectionError: "Connection problem. Check your network and try again.",
    reportIssue: "Report a problem",
    pwaInstall: "📲 Install app",
    pwaIosTitle: "Install on iPhone",
    pwaIosBody: "Tap Share ⬆️ then \"Add to Home Screen\".",
    pwaIosClose: "Got it",
    musicCredit: "Music by",
    musicFrom: "from",
    musicMute: "Mute music",
    musicUnmute: "Unmute music",
    musicTap: "Tap anywhere to start the music",
    pwaIosBrowserTitle: "Open in Safari",
    pwaIosBrowserBody: "You can't install the app from here. Tap \"•••\" at the top right, choose \"Open in Safari\" and try again.",
    pwaBannerText: "Keep Global Awakening on your phone",
    pwaBannerClose: "Close",
    setPassword: "Set Password",
    changePassword: "Change Password",
    passwordSet: "Password set!",
    profileSaveFailed: "Could not save your profile. Please log in again.",
    passwordChangeFailed: "Could not change the password. Please log in again.",
    registrationError: "Registration failed. Please try again.",
    newAccountCreated: "Account created! Welcome!",
    tabGuest: "Guest",
    tabLogin: "Login",
    tabRegister: "Register",
    noAccountYet: "No account yet? Register",
    alreadyHaveAccount: "Already have an account? Login",
    forgotPassword: "Forgot password?",
    resetPassword: "Reset Password",
    backToLogin: "Back to login",
    newPasswordPlaceholder: "New password",
    confirmPasswordPlaceholder: "Confirm new password",
    passwordsNoMatch: "Passwords do not match",
    resetEmailSent: "If the address is registered, we've sent you an email. Click the link inside.",
    resetTokenInvalid: "Link invalid or expired. Please request a new one.",
    resetSuccess: "Password updated! You can now log in.",
    setNewPassword: "Set new password",
    magicLinkSent: "If the address is registered, we've sent you a login link.",
    magicLinkInvalid: "Link invalid or expired. Please request a new one.",
    sendMagicLink: "Send login link",
    magicLinkHint: "Login with magick link →",
    guestBadge: "Guest",
    registeredBadge: "Registered",
    guestCodeLabel: "Your researcher code",
    guestCodeHint: "Anonymous but recognizable (saved on this device): if you get exceptional telepathy results, we may publicly call for this code so you can come forward — only if you wish.",
    registerInvite: "Register to save your profile permanently",
    logout: "Logout",
    logoutConfirmTitle: "Log out?",
    logoutConfirmBody: "You'll return to the welcome screen.",
    logoutConfirmYes: "Log out",
    logoutConfirmNo: "Cancel",
    gdprTitle: "Your data (GDPR)",
    gdprExport: "Export my data",
    gdprExporting: "Preparing…",
    gdprDelete: "Delete account",
    gdprDeleteTitle: "Delete your account?",
    gdprDeleteBody: "This permanently deletes your profile, private messages and scores. Your public posts and comments are kept but shown as \"Utente eliminato\". This cannot be undone.",
    gdprDeleteConfirmLabel: "Type your nickname to confirm:",
    gdprDeleteConfirmBtn: "Delete forever",
    gdprDeleteCancel: "Cancel",
    gdprDeleting: "Deleting…",
    gdprExportError: "Export failed. Please try again.",
    gdprDeleteError: "Deletion failed. Please try again.",
    tabs: {
      rituals: "Rituals",
      telepathy: "Telepathy",
      consciousness: "Consciousness"
    },
    showTelepathyScore: "Show telepathy score",
    pushChiedi: "Want me to notify you when it starts?",
    pushSi: "Yes, notify me",
    pushNo: "Not now",
    pushImpostazioni: "Notify me when a ritual starts",
    pushIosInstalla: "To receive notifications, add the app to your Home Screen first.",
    editProfile: "Edit Profile",
    profile: {
      title: "Your Profile",
      subtitle: "Tell the community about yourself",
      bio: "Bio",
      bioPlaceholder: "Tell us about your spiritual journey...",
      starseedType: "Starseed Type",
      avatar: "Avatar",
      country: "Country (optional)",
      countryPlaceholder: "Your country",
      interests: "Spiritual Interests",
      experienceLevel: "Experience Level",
      save: "Save Profile",
      saved: "Profile Saved!",
      starseedTypes: {
        pleiadian: "Pleiadian",
        sirian: "Sirian",
        arcturian: "Arcturian",
        andromedan: "Andromedan",
        lyran: "Lyran",
        orion: "Orion",
        universal: "Universal"
      },
      experienceLevels: {
        beginner: "Beginner",
        intermediate: "Intermediate",
        advanced: "Advanced",
        master: "Master"
      },
      interestsList: {
        meditation: "Meditation",
        telepathy: "Telepathy",
        healing: "Healing",
        astrology: "Astrology",
        lucidDreams: "Lucid Dreams",
        astralProjection: "Astral Projection",
        channeling: "Channeling"
      }
    },
    rituals: {
      title: "Global Rituals",
      repeat: "Repeats",
      repeatNever: "Just once",
      repeatDaily: "Every day",
      repeatDays: "Chosen days",
      until: "Until",
      weekdaysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      everyDay: "Every day",
      atTime: "at",
      dayOf: (n, m) => `day ${n} of ${m}`,
      leave: "Leave",
      leaveFailed: "Could not leave the ritual.",
      stop: "Stop",
      stopTitle: "Stop the cycle?",
      stopBody: "The cycle stops: there will be no more sessions. The current one, if any, ends normally.",
      stopYes: "Stop",
      stopNo: "Let it continue",
      stopFailed: "Could not stop the cycle.",
      reloginNeeded: "To continue, please sign in again: use “Forgot password?” to choose a new password.",
      room: "Ritual room",
      peopleHere: n => n === 1 ? "1 person here now" : `${n} people here now`,
      closeRoom: "Close",
      enterRoom: "Enter",
      descCounter: n => `${n} characters left`,
      recurrenceErrors: {
        recurrence_incomplete: "Choose the days and an end date.",
        recurrence_days_invalid: "Choose at least one day of the week.",
        recurrence_end_invalid: "The end date must be after the start, at most one year away.",
        recurrence_duration_too_long: "A repeating ritual lasts 12 hours at most.",
        recurrence_empty: "None of the chosen days falls in this period.",
        recurrence_limit: "You already have 10 repeating rituals: stop one before creating another.",
        timezone_invalid: "Your phone's time zone is not recognised."
      },
      subtitle: "Synchronized awakening ceremonies",
      deleteRitual: "Delete",
      deleteTitle: "Delete this ritual?",
      deleteBody: "It disappears for everyone who joined. Only possible before it starts.",
      deleteYes: "Delete",
      deleteNo: "Keep it",
      deleteStarted: "Too late: the ritual has already started.",
      thresholdTap: "Tap to enter the ritual",
      thresholdHint: "The music will start with your touch",
      deleteFailed: "The ritual could not be deleted.",
      createRitual: "Propose Ritual",
      noRituals: "No rituals yet. Be the first to propose one!",
      participants: "participants",
      startsIn: "Starts in",
      live: "LIVE NOW",
      ended: "Ended",
      join: "Join",
      joined: "Joined",
      sendEnergy: "Send Energy",
      candleLight: "Light a candle",
      candleExtinguish: "Extinguish your candle",
      candlesLitBy: "Candles lit by",
      candleNotLive: "The candle can be lit during the ritual.",
      candleNotPresent: "Enter the room to light the candle.",
      candleTooMany: "The room is full of candles.",
      modalTitle: "Create Ritual",
      ritualName: "Ritual Name",
      description: "Description",
      type: "Type",
      sacredNumber: "Sacred Number",
      date: "Date",
      time: "Time",
      duration: "Duration (minutes)",
      create: "Create Ritual",
      cancel: "Cancel"
    },
    feed: {
      title: "Consciousness Feed",
      subtitle: "Share your thoughts with the community",
      newPostPlaceholder: "What's on your mind? Share your awakening...",
      post: "Post",
      comment: "Comment",
      comments: "comments",
      addComment: "Add a comment...",
      noFeed: "No posts yet. Be the first to share!",
      showComments: "Show comments",
      hideComments: "Hide comments"
    },
    map: {
      title: "Global Network",
      subtitle: "Starseeds awakening together",
      visible: "visible starseeds"
    },
    social: {
      viewProfile: "View Profile",
      telepathyScore: "Rounds Played",
      bestScore: "Match %",
      community: "Community",
      noProfile: "No profile yet",
      close: "Close",
      notifications: "Notifications"
    },
    stats: {
      activeRituals: "Active Rituals",
      roundsPlayed: "Rounds Played",
      onlineNow: "Online Now"
    },
    privacy: {
      linkLabel: "Privacy",
      title: "Privacy Policy",
      lastUpdated: "Last updated: June 2026",
      intro: "Global Awakening is a personal, non-commercial project. This page explains, in plain language, what data we handle and why.",
      sections: [{
        heading: "What we collect",
        body: "When you create an account: your email, a password (stored only as a cryptographic hash, never in plain text), and the nickname, short bio and country you choose to share. As you use the app we store your activity: telepathy scores, private messages, rituals, posts and comments, and your online status. Your browser also keeps your nickname and preferences in local storage. We do not use cookies, analytics or any external trackers."
      }, {
        heading: "Why we use it",
        body: "Only to make the app work: signing you in, powering the telepathy, rituals and community features, and showing in-app notifications. We never sell your data or use it for advertising."
      }, {
        heading: "Where it lives",
        body: "Your data is stored on Supabase (our database). Transactional emails (password reset and magic link) are sent through EmailJS. The site is hosted on GitHub Pages. We share data with these providers only as needed to run the service."
      }, {
        heading: "How long we keep it",
        body: "Account and activity data are kept while your account is active. Password-reset and magic-link tokens expire within 15 minutes."
      }, {
        heading: "Your rights",
        body: "Under the GDPR you can access, correct, delete or export your data, or object to its use. Export and account deletion are available self-service from your profile (open your profile → \"Your data (GDPR)\"). For correction or objection, open an issue on our public GitHub repository (github.com/global-awakening/global-awakening.github.io)."
      }, {
        heading: "Security",
        body: "Data is stored on Supabase and passwords are kept hashed, never in plain text. As a small personal project we cannot guarantee enterprise-grade security — please don't share anything you wouldn't want others to potentially see."
      }, {
        heading: "Changes",
        body: "The version shown here is always the current one. If anything important changes, we'll update this page."
      }],
      close: "Close"
    },
    messages: {
      title: "Messages",
      subtitle: "Private conversations",
      noConversations: "No conversations yet. Visit a profile and send a message!",
      guestPrompt: "Register to send private messages",
      receiverNotRegistered: "This starseed isn't registered yet, so they can't receive private messages. Invite them to register!",
      placeholder: "Type a message...",
      send: "Send",
      sendMessage: "Send Message",
      newMessage: "New message to",
      messagePlaceholder: "Write your first message...",
      back: "Back",
      you: "You"
    },
    telepathy: {
      title: "Telepathy Training",
      subtitle: "Develop your psychic abilities",
      howItWorks: "How it works:",
      step1: "1. Pick a partner from the list or find a random one",
      step2: "2. One sends a symbol, the other receives it",
      step3: "3. After 7 rounds you can change game mode!",
      onlineUsers: "Online users",
      inSession: "in session",
      available: "available",
      propose: "Invite",
      inviteSent: "Invite sent...",
      randomMatch: "Random Match",
      searching: "Searching for partner...",
      queuePosition: "Queue position",
      starseedWaiting: "starseed waiting",
      starseedsWaiting: "starseeds waiting",
      cancel: "Cancel",
      partnerLeftSuffix: "ended the session",
      yourPartnerFallback: "Your partner",
      backToLobby: "Back to lobby",
      differentChoices: "Different choices — continuing with",
      levelShapes: "Symbols",
      levelNumbers: "Numbers",
      levelWords: "Letters",
      you: "You",
      partner: "Partner",
      ok: "OK",
      yourRole: "Your role",
      roleSwappedSender: "🔄 Roles swapped! You are now the Sender",
      roleSwappedReceiver: "🔄 Roles swapped! You are now the Receiver",
      roleSender: "Sender",
      roleReceiver: "Receiver",
      roundLabel: "Round",
      matchLabel: "Match",
      levelLabel: "Level",
      accuracyLabel: "Accuracy",
      statusLabel: "Status",
      changeLevelPrompt: "Want to change telepathy mode?",
      youChose: "You chose",
      waitingDots: "Waiting...",
      continueLevel: "Continue",
      levelChooseTitle: "Choose the new mode",
      levelKeep: "Keep current",
      levelWaiting: "is choosing the new game mode…",
      tabPlay: "Play",
      tabLeaderboard: "Leaderboard",
      leaderboardTitle: "Top telepaths",
      leaderboardEmpty: "Not enough data yet — play to appear here.",
      leaderboardPlayer: "Player",
      leaderboardMatches: "Matches",
      leaderboardAccuracy: "Accuracy",
      leaderboardRefresh: "Refresh",
      pickSymbol: "Pick the symbol to send:",
      sendTelepathically: "Send Telepathically",
      symbolSentGuess: "✨ Symbol sent! Which one do you receive?",
      waitingForSend: "is choosing the symbol… wait for it to light up",
      confirm: "Confirm",
      senderWaiting: "Symbol sent! Waiting for the receiver to guess...",
      receiverWaiting: "Answer sent! Waiting for the sender...",
      matchResult: "✨ TELEPATHIC MATCH! ✨",
      noMatch: "Not this time. Keep going!",
      sentLabel: "Sent",
      guessedLabel: "Guessed",
      resonance: "Resonance ✨",
      again: "Again",
      nextMatchIn: "New match in",
      endSessionBtn: "End Session",
      endSessionConfirmTitle: "Leave session?",
      endSessionConfirmBody: "Your partner will be notified. This cannot be undone.",
      endSessionConfirmYes: "Leave",
      endSessionConfirmNo: "Stay",
      sessionComplete: "Session Complete!",
      roundsPlayed: "Rounds played",
      correctMatches: "Correct matches",
      accuracyColon: "Accuracy:",
      playAgainWith: "Play again with",
      backToLobbyCap: "Back to Lobby",
      leaveSession: "Leave session",
      chatWith: "Chat with",
      noMessages: "No messages yet",
      chatPlaceholder: "Type...",
      statusChoosingLevel: "Waiting for level choice...",
      statusRoundDone: "Round complete!",
      statusGuessing: "is guessing...",
      statusWaitingSymbol: "is waiting for your symbol",
      statusWaitingResult: "Waiting for result...",
      statusSent: "has sent! Guess.",
      statusChoosing: "is choosing...",
      partnerOffline: "is no longer online — go back to the lobby and pick another partner.",
      inviteModalTitle: "Telepathy Training Invite",
      inviteModalBody: "wants to do telepathy training with you!",
      acceptBtn: "Accept",
      declineBtn: "Decline",
      inviteExpired: "Expired",
      trainingFloatingPrefix: "Training in progress with",
      trainingFloatingCta: "Return"
    },
    moderation: {
      menu: "Actions",
      report: "Report",
      block: "Block",
      unblock: "Unblock",
      cancel: "Cancel",
      blockedUsers: "Blocked users",
      noBlocked: "You haven't blocked anyone.",
      blockTitle: "Block this person?",
      blockConfirm: "You won't see their content and they won't be able to message you. You can undo this anytime.",
      blockDone: "User blocked.",
      unblockDone: "User unblocked.",
      reportTitle: "Report content",
      reportWhy: "Why are you reporting this?",
      reportNotes: "Notes (optional)",
      reportSend: "Send report",
      reportDone: "Report sent. We'll review it within 48 hours.",
      reportRules: "Content rules",
      guestOnly: "You need a registered account to report or block.",
      reasons: {
        spam: "Spam or advertising",
        harassment: "Harassment or insults",
        hate: "Hate or discrimination",
        sexual: "Sexual content",
        violence: "Violence or threats",
        self_harm: "Self-harm or suicide",
        other: "Something else"
      }
    }
  },
  it: {
    title: "Risveglio Globale",
    subtitle: "Uniti nella Luce, Risvegliati come Uno",
    enterPlatform: "Entra",
    enterAsGuest: "Entra come Ospite",
    login: "Accedi",
    register: "Registrati",
    passwordOptional: "Password (opzionale)",
    emailPlaceholder: "Indirizzo email",
    usernamePlaceholder: "Scegli un username...",
    invalidCredentials: "Email o password non corretti",
    tooManyAttempts: "Troppi tentativi, riprova tra qualche minuto",
    emailAlreadyUsed: "Questa email e' gia' registrata",
    usernameAlreadyUsed: "Questo username e' gia' in uso",
    fillAllFields: "Compila tutti i campi",
    invalidEmail: "Inserisci un indirizzo email valido",
    connectionError: "Problema di connessione. Controlla la rete e riprova.",
    reportIssue: "Segnala un problema",
    pwaInstall: "📲 Installa app",
    pwaIosTitle: "Installa su iPhone",
    pwaIosBody: "Tocca Condividi ⬆️ poi \"Aggiungi alla schermata Home\".",
    pwaIosClose: "Ho capito",
    musicCredit: "Musica di",
    musicFrom: "da",
    musicMute: "Silenzia la musica",
    musicUnmute: "Riattiva la musica",
    musicTap: "Tocca lo schermo per far partire la musica",
    pwaIosBrowserTitle: "Apri in Safari",
    pwaIosBrowserBody: "Da qui l'app non si può installare. Tocca «•••» in alto a destra, scegli «Apri in Safari» e riprova.",
    pwaBannerText: "Tieni Risveglio Globale sul telefono",
    pwaBannerClose: "Chiudi",
    setPassword: "Imposta Password",
    changePassword: "Cambia Password",
    passwordSet: "Password impostata!",
    profileSaveFailed: "Non è stato possibile salvare il profilo. Rientra e riprova.",
    passwordChangeFailed: "Non è stato possibile cambiare la password. Rientra e riprova.",
    registrationError: "Registrazione non riuscita. Riprova.",
    newAccountCreated: "Account creato! Benvenuto!",
    tabGuest: "Ospite",
    tabLogin: "Accedi",
    tabRegister: "Registrati",
    noAccountYet: "Non hai un account? Registrati",
    alreadyHaveAccount: "Hai gia' un account? Accedi",
    forgotPassword: "Password dimenticata?",
    resetPassword: "Reimposta Password",
    backToLogin: "Torna al login",
    newPasswordPlaceholder: "Nuova password",
    confirmPasswordPlaceholder: "Conferma nuova password",
    passwordsNoMatch: "Le password non coincidono",
    resetEmailSent: "Se l'indirizzo è registrato, ti abbiamo scritto. Clicca il link nell'email.",
    resetTokenInvalid: "Link non valido o scaduto. Richiedine uno nuovo.",
    resetSuccess: "Password aggiornata! Puoi ora accedere.",
    setNewPassword: "Imposta nuova password",
    magicLinkSent: "Se l'indirizzo è registrato, ti abbiamo mandato un link per entrare.",
    magicLinkInvalid: "Link non valido o scaduto. Richiedine uno nuovo.",
    sendMagicLink: "Invia link di accesso",
    magicLinkHint: "Login con magick link →",
    guestBadge: "Ospite",
    registeredBadge: "Registrato",
    guestCodeLabel: "Il tuo codice ricercatore",
    guestCodeHint: "Anonimo ma riconoscibile (salvato su questo dispositivo): se ottieni risultati di telepatia eccezionali potremmo lanciare un appello pubblico per questo codice, così puoi farti avanti — solo se vuoi.",
    registerInvite: "Registrati per salvare il profilo in modo permanente",
    logout: "Esci",
    logoutConfirmTitle: "Vuoi uscire?",
    logoutConfirmBody: "Tornerai alla schermata di accesso.",
    logoutConfirmYes: "Esci",
    logoutConfirmNo: "Annulla",
    gdprTitle: "I tuoi dati (GDPR)",
    gdprExport: "Esporta i miei dati",
    gdprExporting: "Preparazione…",
    gdprDelete: "Elimina account",
    gdprDeleteTitle: "Vuoi eliminare l'account?",
    gdprDeleteBody: "Questo elimina definitivamente profilo, messaggi privati e punteggi. I tuoi post e commenti pubblici restano ma appariranno come \"Utente eliminato\". L'operazione non è reversibile.",
    gdprDeleteConfirmLabel: "Digita il tuo nickname per confermare:",
    gdprDeleteConfirmBtn: "Elimina per sempre",
    gdprDeleteCancel: "Annulla",
    gdprDeleting: "Eliminazione…",
    gdprExportError: "Export non riuscito. Riprova.",
    gdprDeleteError: "Eliminazione non riuscita. Riprova.",
    tabs: {
      rituals: "Rituali",
      telepathy: "Telepatia",
      consciousness: "Coscienza"
    },
    showTelepathyScore: "Mostra punteggio telepatia",
    pushChiedi: "Vuoi che ti avvisi quando inizia?",
    pushSi: "Sì, avvisami",
    pushNo: "Non ora",
    pushImpostazioni: "Avvisami quando inizia un rituale",
    pushIosInstalla: "Per ricevere le notifiche, aggiungi prima l'app alla schermata Home.",
    editProfile: "Modifica Profilo",
    profile: {
      title: "Il Tuo Profilo",
      subtitle: "Racconta alla comunità di te",
      bio: "Bio",
      bioPlaceholder: "Raccontaci del tuo percorso spirituale...",
      starseedType: "Tipo di Starseed",
      avatar: "Avatar",
      country: "Paese (opzionale)",
      countryPlaceholder: "Il tuo paese",
      interests: "Interessi Spirituali",
      experienceLevel: "Livello Esperienza",
      save: "Salva Profilo",
      saved: "Profilo Salvato!",
      starseedTypes: {
        pleiadian: "Pleiadiano",
        sirian: "Siriano",
        arcturian: "Arcturiano",
        andromedan: "Andromedano",
        lyran: "Lirano",
        orion: "Orione",
        universal: "Universale"
      },
      experienceLevels: {
        beginner: "Principiante",
        intermediate: "Intermedio",
        advanced: "Avanzato",
        master: "Maestro"
      },
      interestsList: {
        meditation: "Meditazione",
        telepathy: "Telepatia",
        healing: "Guarigione",
        astrology: "Astrologia",
        lucidDreams: "Sogni Lucidi",
        astralProjection: "Proiezione Astrale",
        channeling: "Canalizzazione"
      }
    },
    rituals: {
      title: "Rituali Globali",
      repeat: "Si ripete",
      repeatNever: "Una volta sola",
      repeatDaily: "Ogni giorno",
      repeatDays: "Giorni scelti",
      until: "Fino al",
      weekdaysShort: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"],
      everyDay: "Ogni giorno",
      atTime: "alle",
      dayOf: (n, m) => `giorno ${n} di ${m}`,
      leave: "Lascia",
      leaveFailed: "Non è stato possibile lasciare il rituale.",
      stop: "Ferma",
      stopTitle: "Fermare il ciclo?",
      stopBody: "Il ciclo si ferma: non ci saranno altri appuntamenti. Quello in corso, se c'è, finisce normalmente.",
      stopYes: "Ferma",
      stopNo: "Lascialo andare",
      stopFailed: "Non è stato possibile fermare il ciclo.",
      reloginNeeded: "Per continuare accedi di nuovo: usa «Password dimenticata?» per scegliere una nuova password.",
      room: "Stanza del rituale",
      peopleHere: n => n === 1 ? "1 persona qui adesso" : `${n} persone qui adesso`,
      closeRoom: "Chiudi",
      enterRoom: "Entra",
      descCounter: n => `ancora ${n} caratteri`,
      recurrenceErrors: {
        recurrence_incomplete: "Scegli i giorni e la data di fine.",
        recurrence_days_invalid: "Scegli almeno un giorno della settimana.",
        recurrence_end_invalid: "La data di fine deve essere dopo l'inizio, al massimo fra un anno.",
        recurrence_duration_too_long: "Un rituale che si ripete dura al massimo 12 ore.",
        recurrence_empty: "In questo periodo non cade nessuno dei giorni scelti.",
        recurrence_limit: "Hai già 10 rituali che si ripetono: fermane uno prima di crearne un altro.",
        timezone_invalid: "Il fuso orario del telefono non è riconosciuto."
      },
      subtitle: "Cerimonie di risveglio sincronizzate",
      deleteRitual: "Cancella",
      deleteTitle: "Cancellare questo rituale?",
      deleteBody: "Sparisce per chiunque abbia aderito. Si può fare solo prima che inizi.",
      deleteYes: "Cancella",
      deleteNo: "Lascialo",
      deleteStarted: "Troppo tardi: il rituale è già iniziato.",
      thresholdTap: "Tocca per entrare nel rituale",
      thresholdHint: "La musica partirà con il tuo tocco",
      deleteFailed: "Non è stato possibile cancellare il rituale.",
      createRitual: "Proponi Rituale",
      noRituals: "Nessun rituale ancora. Sii il primo a proporne uno!",
      participants: "partecipanti",
      startsIn: "Inizia tra",
      live: "IN DIRETTA",
      ended: "Terminato",
      join: "Unisciti",
      joined: "Unito",
      sendEnergy: "Invia Energia",
      candleLight: "Accendi una candela",
      candleExtinguish: "Spegni la tua candela",
      candlesLitBy: "Candele accese da",
      candleNotLive: "La candela si accende durante il rituale.",
      candleNotPresent: "Entra nella stanza per accendere la candela.",
      candleTooMany: "La stanza è piena di candele.",
      modalTitle: "Crea Rituale",
      ritualName: "Nome Rituale",
      description: "Descrizione",
      type: "Tipo",
      sacredNumber: "Numero Sacro",
      date: "Data",
      time: "Ora",
      duration: "Durata (minuti)",
      create: "Crea Rituale",
      cancel: "Annulla"
    },
    feed: {
      title: "Feed Coscienza",
      subtitle: "Condividi i tuoi pensieri con la comunità",
      newPostPlaceholder: "Cosa hai in mente? Condividi il tuo risveglio...",
      post: "Pubblica",
      comment: "Commenta",
      comments: "commenti",
      addComment: "Aggiungi un commento...",
      noFeed: "Nessun post ancora. Sii il primo a condividere!",
      showComments: "Mostra commenti",
      hideComments: "Nascondi commenti"
    },
    map: {
      title: "Rete Globale",
      subtitle: "Starseeds che si risvegliano insieme",
      visible: "starseeds visibili"
    },
    social: {
      viewProfile: "Vedi Profilo",
      telepathyScore: "Round Giocati",
      bestScore: "Match %",
      community: "Comunita'",
      noProfile: "Nessun profilo ancora",
      close: "Chiudi",
      notifications: "Notifiche"
    },
    stats: {
      activeRituals: "Rituali Attivi",
      roundsPlayed: "Round Giocati",
      onlineNow: "Online Ora"
    },
    privacy: {
      linkLabel: "Privacy",
      title: "Informativa sulla privacy",
      lastUpdated: "Ultimo aggiornamento: giugno 2026",
      intro: "Global Awakening è un progetto personale e non commerciale. Questa pagina spiega, in parole semplici, quali dati trattiamo e perché.",
      sections: [{
        heading: "Quali dati raccogliamo",
        body: "Quando crei un account: la tua email, una password (memorizzata solo come hash crittografico, mai in chiaro) e il nickname, la breve bio e il paese che scegli di condividere. Mentre usi l'app salviamo la tua attività: punteggi della telepatia, messaggi privati, rituali, post e commenti, e il tuo stato online. Il browser conserva inoltre nickname e preferenze nel local storage. Non usiamo cookie, analytics né tracker esterni."
      }, {
        heading: "Perché li usiamo",
        body: "Solo per far funzionare l'app: accesso, funzionalità di telepatia, rituali e community, e notifiche all'interno dell'app. Non vendiamo mai i tuoi dati né li usiamo per pubblicità."
      }, {
        heading: "Dove sono conservati",
        body: "I tuoi dati sono conservati su Supabase (il nostro database). Le email transazionali (reset password e magic link) vengono inviate tramite EmailJS. Il sito è ospitato su GitHub Pages. Condividiamo i dati con questi fornitori solo per quanto necessario a far funzionare il servizio."
      }, {
        heading: "Per quanto tempo li conserviamo",
        body: "I dati dell'account e di attività restano finché il tuo account è attivo. I token di reset password e magic link scadono entro 15 minuti."
      }, {
        heading: "I tuoi diritti",
        body: "In base al GDPR puoi accedere, rettificare, cancellare o esportare i tuoi dati, oppure opporti al loro utilizzo. Export ed eliminazione dell'account sono disponibili in autonomia dal tuo profilo (apri il profilo → \"I tuoi dati (GDPR)\"). Per rettifica o opposizione, apri una issue sul nostro repository GitHub pubblico (github.com/global-awakening/global-awakening.github.io)."
      }, {
        heading: "Sicurezza",
        body: "I dati sono conservati su Supabase e le password sono salvate sotto forma di hash, mai in chiaro. Trattandosi di un piccolo progetto personale non possiamo garantire una sicurezza di livello aziendale: ti invitiamo a non condividere nulla che non vorresti potesse essere visto da altri."
      }, {
        heading: "Modifiche",
        body: "La versione mostrata qui è sempre quella attuale. Se qualcosa di importante cambia, aggiorneremo questa pagina."
      }],
      close: "Chiudi"
    },
    messages: {
      title: "Messaggi",
      subtitle: "Conversazioni private",
      noConversations: "Nessuna conversazione. Visita un profilo e invia un messaggio!",
      guestPrompt: "Registrati per inviare messaggi privati",
      receiverNotRegistered: "Questo starseed non è ancora registrato, quindi non può ricevere messaggi privati. Invitalo a registrarsi!",
      placeholder: "Scrivi un messaggio...",
      send: "Invia",
      sendMessage: "Invia Messaggio",
      newMessage: "Nuovo messaggio a",
      messagePlaceholder: "Scrivi il tuo primo messaggio...",
      back: "Indietro",
      you: "Tu"
    },
    telepathy: {
      title: "Allenamento Telepatico",
      subtitle: "Sviluppa le tue capacita' psichiche",
      howItWorks: "Come funziona:",
      step1: "1. Scegli un partner dalla lista o cerca uno random",
      step2: "2. Uno invia un simbolo, l'altro lo riceve",
      step3: "3. Dopo 7 round puoi cambiare tipo di gioco!",
      onlineUsers: "Utenti online",
      inSession: "in sessione",
      available: "disponibile",
      propose: "Proponi",
      inviteSent: "Invito inviato...",
      randomMatch: "Abbinamento Random",
      searching: "Cerco un partner...",
      queuePosition: "Posizione in coda",
      starseedWaiting: "starseed in attesa",
      starseedsWaiting: "starseed in attesa",
      cancel: "Annulla",
      partnerLeftSuffix: "ha terminato la sessione",
      yourPartnerFallback: "Il tuo partner",
      backToLobby: "Torna alla lobby",
      differentChoices: "Scelte diverse — si continua con",
      levelShapes: "Simboli",
      levelNumbers: "Numeri",
      levelWords: "Lettere",
      you: "Tu",
      partner: "Partner",
      ok: "Ok",
      yourRole: "Il tuo ruolo",
      roleSwappedSender: "🔄 Ruoli invertiti! Ora sei il Mittente",
      roleSwappedReceiver: "🔄 Ruoli invertiti! Ora sei il Ricevente",
      roleSender: "Mittente",
      roleReceiver: "Ricevitore",
      roundLabel: "Round",
      matchLabel: "Match",
      levelLabel: "Livello",
      accuracyLabel: "Precisione",
      statusLabel: "Stato",
      changeLevelPrompt: "Vuoi cambiare tipo di telepatia?",
      youChose: "Hai scelto",
      waitingDots: "Aspettando...",
      continueLevel: "Continua",
      levelChooseTitle: "Scegli la nuova modalità",
      levelKeep: "Resta così",
      levelWaiting: "sta scegliendo la nuova modalità di gioco…",
      tabPlay: "Gioca",
      tabLeaderboard: "Classifica",
      leaderboardTitle: "Migliori telepati",
      leaderboardEmpty: "Ancora pochi dati — gioca per comparire qui.",
      leaderboardPlayer: "Giocatore",
      leaderboardMatches: "Match",
      leaderboardAccuracy: "Precisione",
      leaderboardRefresh: "Aggiorna",
      pickSymbol: "Scegli il simbolo da inviare:",
      sendTelepathically: "Invia Telepaticamente",
      symbolSentGuess: "✨ Simbolo inviato! Quale ricevi?",
      waitingForSend: "sta scegliendo il simbolo… aspetta che si accenda",
      confirm: "Conferma",
      senderWaiting: "Simbolo inviato! In attesa che il ricevitore indovini...",
      receiverWaiting: "Risposta inviata! In attesa del mittente...",
      matchResult: "✨ MATCH TELEPATICO! ✨",
      noMatch: "Non questa volta. Continua!",
      sentLabel: "Inviato",
      guessedLabel: "Indovinato",
      resonance: "Sintonia ✨",
      again: "Ancora",
      nextMatchIn: "Nuovo match tra",
      endSessionBtn: "Termina Sessione",
      endSessionConfirmTitle: "Uscire dalla sessione?",
      endSessionConfirmBody: "Il tuo partner riceverà la notifica. Non si può tornare indietro.",
      endSessionConfirmYes: "Esci",
      endSessionConfirmNo: "Resta",
      sessionComplete: "Sessione Completata!",
      roundsPlayed: "Round giocati",
      correctMatches: "Match corretti",
      accuracyColon: "Precisione:",
      playAgainWith: "Altra sessione con",
      backToLobbyCap: "Torna alla Lobby",
      leaveSession: "Esci dalla sessione",
      chatWith: "Chat con",
      noMessages: "Nessun messaggio ancora",
      chatPlaceholder: "Scrivi...",
      statusChoosingLevel: "In attesa di scegliere il livello...",
      statusRoundDone: "Round completato!",
      statusGuessing: "sta indovinando...",
      statusWaitingSymbol: "aspetta il tuo simbolo",
      statusWaitingResult: "In attesa del risultato...",
      statusSent: "ha inviato! Indovina.",
      statusChoosing: "sta scegliendo...",
      partnerOffline: "non e' piu' online — torna alla lobby e scegli un altro partner.",
      inviteModalTitle: "Invito all'Allenamento Telepatico",
      inviteModalBody: "ti vuole fare training telepatico!",
      acceptBtn: "Accetta",
      declineBtn: "Rifiuta",
      inviteExpired: "Scaduto",
      trainingFloatingPrefix: "Training in corso con",
      trainingFloatingCta: "Torna"
    },
    moderation: {
      menu: "Azioni",
      report: "Segnala",
      block: "Blocca",
      unblock: "Sblocca",
      cancel: "Annulla",
      blockedUsers: "Utenti bloccati",
      noBlocked: "Non hai bloccato nessuno.",
      blockTitle: "Vuoi bloccare questa persona?",
      blockConfirm: "Non vedrai più i suoi contenuti e non potrà scriverti. Puoi annullare quando vuoi.",
      blockDone: "Utente bloccato.",
      unblockDone: "Utente sbloccato.",
      reportTitle: "Segnala contenuto",
      reportWhy: "Perché lo segnali?",
      reportNotes: "Note (facoltative)",
      reportSend: "Invia segnalazione",
      reportDone: "Segnalazione inviata. La esamineremo entro 48 ore.",
      reportRules: "Regolamento dei contenuti",
      guestOnly: "Serve un account registrato per segnalare o bloccare.",
      reasons: {
        spam: "Spam o pubblicità",
        harassment: "Molestie o insulti",
        hate: "Odio o discriminazione",
        sexual: "Contenuto sessuale",
        violence: "Violenza o minacce",
        self_harm: "Autolesionismo o suicidio",
        other: "Altro"
      }
    }
  }
};
const DURATA_RITUALE_PREDEFINITA = 3;
function GlobalAwakeningPlatform() {
  const [lang, setLang] = useState('en');
  const [activeTab, setActiveTab] = useState('rituals');
  const [nickname, setNickname] = useState(() => localStorage.getItem('ga_nickname') || '');
  const [tempNickname, setTempNickname] = useState('');
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(() => !localStorage.getItem('ga_nickname'));
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [totalRounds, setTotalRounds] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searchingPartner, setSearchingPartner] = useState(false);
  const [partner, setPartner] = useState(null);
  const [role, setRole] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [guessedSymbol, setGuessedSymbol] = useState(null);
  const [waitingForPartner, setWaitingForPartner] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultCountdown, setResultCountdown] = useState(null);
  const lastProcessedRoundRef = React.useRef(-1);
  const endedColumnsSupportedRef = React.useRef(true);
  const [isMatch, setIsMatch] = useState(false);
  const [matchId, setMatchId] = useState(null);
  const [matchUser1Id, setMatchUser1Id] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [partnerSymbol, setPartnerSymbol] = useState(null);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [directInviteTarget, setDirectInviteTarget] = useState(null);
  const [invitoInUscita, setInvitoInUscita] = useState(null);
  const [scartoOrologio, setScartoOrologio] = useState(0);
  const [adessoLocale, setAdessoLocale] = useState(Date.now());
  const [avvisoInviti, setAvvisoInviti] = useState(null);
  const [attesaInvitante, setAttesaInvitante] = useState(null);
  const [giroInviti, setGiroInviti] = useState(0);
  const [currentLevel, setCurrentLevel] = useState('lvl3');
  const [roundCount, setRoundCount] = useState(0);
  const swapRole = r => r === 'sender' ? 'receiver' : 'sender';
  const roleForRound = (baseRole, round) => Math.floor(round / 3) % 2 === 0 ? baseRole : swapRole(baseRole);
  const effectiveRole = role ? roleForRound(role, roundCount) : role;
  const [sessionMatches, setSessionMatches] = useState(0);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem('ga_install_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const dismissInstallBanner = () => {
    setInstallBannerDismissed(true);
    try {
      localStorage.setItem('ga_install_banner_dismissed', '1');
    } catch {}
  };
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInAppBrowser = typeof navigator !== 'undefined' && /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedIn|Pinterest|WhatsApp/i.test(navigator.userAgent);
  useEffect(() => {
    const onBip = e => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);
  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosInstall(true);
    }
  };
  const sessionMatchesRef = React.useRef(0);
  React.useEffect(() => {
    sessionMatchesRef.current = sessionMatches;
  }, [sessionMatches]);
  const [showLevelBanner, setShowLevelBanner] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [partnerDisconnected, setPartnerDisconnected] = useState(false);
  const [onlineUsersForTelepathy, setOnlineUsersForTelepathy] = useState([]);
  const [senderHasSent, setSenderHasSent] = useState(false);
  const [resultRole, setResultRole] = useState(null);
  const [resultLevel, setResultLevel] = useState(null);
  const [roleSwapOverlay, setRoleSwapOverlay] = useState(null);
  const [telepathyChatOpen, setTelepathyChatOpen] = useState(false);
  const [telepathyChatMessages, setTelepathyChatMessages] = useState([]);
  const [newTelepathyMessage, setNewTelepathyMessage] = useState('');
  const [isTabHidden, setIsTabHidden] = useState(typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const onVisChange = () => setIsTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, []);
  const cardCountForLevel = level => {
    if (level === 'numbers') return telepathyNumbers.length;
    if (level === 'words') return telepathyWords.length;
    const m = /^lvl(\d+)$/.exec(level || '');
    return m ? parseInt(m[1], 10) : telepathySymbols.length;
  };
  const getCurrentSymbols = level => {
    if (level === 'numbers') return telepathyNumbers;
    if (level === 'words') return telepathyWords;
    const m = /^lvl(\d+)$/.exec(level || '');
    return m ? telepathySymbols.slice(0, parseInt(m[1], 10)) : telepathySymbols;
  };
  const loadLeaderboard = async () => {
    const {
      data
    } = await supabase.rpc('get_telepathy_leaderboard', {
      p_limit: 10
    });
    setLeaderboard(Array.isArray(data) ? data : []);
  };
  useEffect(() => {
    if (activeTab === 'telepathy' && !partner && !searchingPartner) loadLeaderboard();
  }, [activeTab, partner, searchingPartner]);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [newPrivateMessage, setNewPrivateMessage] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [rituals, setRituals] = useState([]);
  const [posts, setPosts] = useState([]);
  const [commentsMap, setCommentsMap] = useState({});
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [newPostContent, setNewPostContent] = useState('');
  const [newCommentContents, setNewCommentContents] = useState({});
  const expandedPostIdRef = React.useRef(null);
  const [ritualCommentsMap, setRitualCommentsMap] = useState({});
  const [expandedRitualId, setExpandedRitualId] = useState(null);
  const [newRitualCommentContents, setNewRitualCommentContents] = useState({});
  const expandedRitualIdRef = React.useRef(null);
  const [notifItems, setNotifItems] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showCreateRitual, setShowCreateRitual] = useState(false);
  const [newRitual, setNewRitual] = useState({
    name: '',
    description: '',
    type: 'consciousness',
    sacredNumber: 11,
    date: '',
    time: '',
    duration: DURATA_RITUALE_PREDEFINITA,
    ripeti: 'mai',
    giorni: [],
    fino: ''
  });
  React.useEffect(() => {
    expandedPostIdRef.current = expandedPostId;
  }, [expandedPostId]);
  React.useEffect(() => {
    expandedRitualIdRef.current = expandedRitualId;
  }, [expandedRitualId]);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('ga_session_id') || Date.now() + '-' + Math.random());
  const [guestCode] = useState(() => {
    let c = localStorage.getItem('ga_guest_code');
    if (!c) {
      c = makeGuestCode();
      localStorage.setItem('ga_guest_code', c);
    }
    return c;
  });
  const mySlot = matchUser1Id != null ? sessionId === matchUser1Id ? 'user1' : 'user2' : null;
  const levelChangeIndex = Math.floor(roundCount / 7);
  const amIChooser = mySlot !== null && mySlot === (levelChangeIndex % 2 === 1 ? 'user1' : 'user2');
  const [tempPassword, setTempPassword] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [passwordHash, setPasswordHash] = useState(() => localStorage.getItem('ga_pwhash') || null);
  const [loginError, setLoginError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorToast, setErrorToast] = useState(null);
  const [savingContent, setSavingContent] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profilePasswordMsg, setProfilePasswordMsg] = useState('');
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem('ga_is_guest') === 'true');
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('ga_email') || '');
  const [blockedUsers, setBlockedUsers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ga_blocked') || '[]');
    } catch {
      return [];
    }
  });
  const blockedUsersRef = useRef(blockedUsers);
  useEffect(() => {
    blockedUsersRef.current = blockedUsers;
  }, [blockedUsers]);
  const [infoToast, setInfoToast] = useState(null);
  const [authTab, setAuthTab] = useState('login');
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const tok = p.get('reset');
    if (tok) window.history.replaceState({}, '', window.location.pathname);
    return tok || '';
  });
  const [magicToken] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const tok = p.get('magic');
    if (tok) window.history.replaceState({}, '', window.location.pathname);
    return tok || '';
  });
  const [ritualeDaAprire, setRitualeDaAprire] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get('ritual');
    if (id) window.history.replaceState({}, '', window.location.pathname);
    return id && /^\d+$/.test(id) ? Number(id) : null;
  });
  const [invitoDaAprire, setInvitoDaAprire] = useState(() => {
    if (typeof InvitiHelpers === 'undefined') return null;
    const letto = InvitiHelpers.leggiInvitoDaUrl(window.location.search);
    if (letto.presente) window.history.replaceState({}, '', window.location.pathname);
    return letto.presente ? {
      invito: letto.invito,
      azione: letto.azione
    } : null;
  });
  const [confermaBlocco, setConfermaBlocco] = useState(null);
  const [stanzaId, setStanzaId] = useState(null);
  const [presentiStanza, setPresentiStanza] = useState(null);
  const stanza = stanzaId != null ? rituals.find(r => r.id === stanzaId) : null;
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [showMagicLink, setShowMagicLink] = useState(false);
  const t = translations[lang];
  const levelLabel = level => {
    if (level === 'numbers') return t.telepathy.levelNumbers;
    if (level === 'words') return t.telepathy.levelWords;
    const m = /^lvl(\d+)$/.exec(level || '');
    return m ? `${m[1]} ${t.telepathy.levelShapes}` : t.telepathy.levelShapes;
  };
  const avatarEmojis = ['🌟', '✨', '🔮', '🧿', '💫', '⭐', '🌙', '☀️', '🌈', '🦋', '🕊️', '🐉', '🧬', '👁️', '💜', '🔥', '🌸', '🍃', '💎', '🪷'];
  const starseedTypes = ['pleiadian', 'sirian', 'arcturian', 'andromedan', 'lyran', 'orion', 'universal'];
  const experienceLevels = ['beginner', 'intermediate', 'advanced', 'master'];
  const interestKeys = ['meditation', 'telepathy', 'healing', 'astrology', 'lucidDreams', 'astralProjection', 'channeling'];
  const [profile, setProfile] = useState({
    bio: '',
    starseedType: '',
    avatar: '',
    country: '',
    interests: [],
    experienceLevel: ''
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [gdprBusy, setGdprBusy] = useState(false);
  const [showTelepathyScore, setShowTelepathyScore] = useState(() => {
    const stored = localStorage.getItem('ga_show_telepathy');
    return stored !== null ? stored === 'true' : true;
  });
  const [chiediPush, setChiediPush] = useState(false);
  const [mostraInstallaPerPush, setMostraInstallaPerPush] = useState(false);
  const [pushAttive, setPushAttive] = useState(() => {
    try {
      return typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem('ga_push_spento') !== '1';
    } catch (_) {
      return false;
    }
  });
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    const onKeyDown = e => {
      if (e.key !== 'Escape') return;
      if (showPrivacy) {
        setShowPrivacy(false);
        return;
      }
      if (showLogoutConfirm) {
        setShowLogoutConfirm(false);
        return;
      }
      if (showEndSessionConfirm) {
        setShowEndSessionConfirm(false);
        return;
      }
      if (showCreateRitual) {
        setShowCreateRitual(false);
        return;
      }
      if (showEditProfile) {
        setShowEditProfile(false);
        return;
      }
      if (viewingProfile) {
        setViewingProfile(null);
        return;
      }
      if (showNotifPanel) {
        setShowNotifPanel(false);
        return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showPrivacy, showLogoutConfirm, showEndSessionConfirm, showCreateRitual, showEditProfile, viewingProfile, showNotifPanel]);
  useEffect(() => {
    if (!errorToast) return;
    const tmr = setTimeout(() => setErrorToast(null), 4000);
    return () => clearTimeout(tmr);
  }, [errorToast]);
  useEffect(() => {
    if (!infoToast) return;
    const tmr = setTimeout(() => setInfoToast(null), 4000);
    return () => clearTimeout(tmr);
  }, [infoToast]);
  const reloadBlocks = useCallback(async () => {
    if (!nickname || isGuest || !passwordHash) {
      setBlockedUsers([]);
      return;
    }
    const {
      data,
      error
    } = await supabase.rpc('get_my_blocks', {
      p_nickname: nickname,
      p_password_hash: passwordHash
    });
    if (error) return;
    const list = (data || []).map(x => typeof x === 'string' ? x : x.get_my_blocks).filter(Boolean);
    setBlockedUsers(list);
    blockedUsersRef.current = list;
    try {
      localStorage.setItem('ga_blocked', JSON.stringify(list));
    } catch {}
  }, [nickname, isGuest, passwordHash]);
  useEffect(() => {
    reloadBlocks();
  }, [reloadBlocks]);
  const isBlocked = nick => !!nick && blockedUsersRef.current.includes(nick);
  const [openMenu, setOpenMenu] = useState(null);
  const [blockTarget, setBlockTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('spam');
  const [reportNotes, setReportNotes] = useState('');
  useEffect(() => {
    if (!openMenu) return;
    const chiudi = () => setOpenMenu(null);
    const onEsc = e => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    const apertoDa = Date.now();
    const onScroll = e => {
      if (Date.now() - apertoDa < 250) return;
      if (e.target && e.target.closest && e.target.closest('[data-moderation-menu]')) return;
      setOpenMenu(null);
    };
    document.addEventListener('click', chiudi);
    document.addEventListener('keydown', onEsc);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('click', chiudi);
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [openMenu]);
  const doBlock = async nick => {
    if (isGuest || !passwordHash) {
      setErrorToast(t.moderation.guestOnly);
      return;
    }
    const {
      error
    } = await supabase.rpc('block_user', {
      p_nickname: nickname,
      p_password_hash: passwordHash,
      p_blocked_nickname: nick
    });
    if (error) {
      setErrorToast(error.message);
      return;
    }
    await reloadBlocks();
    setInfoToast(t.moderation.blockDone);
  };
  const doUnblock = async nick => {
    if (isGuest || !passwordHash) return;
    const {
      error
    } = await supabase.rpc('unblock_user', {
      p_nickname: nickname,
      p_password_hash: passwordHash,
      p_blocked_nickname: nick
    });
    if (error) {
      setErrorToast(error.message);
      return;
    }
    await reloadBlocks();
    setInfoToast(t.moderation.unblockDone);
  };
  const doReport = async () => {
    if (!reportTarget) return;
    if (isGuest || !passwordHash) {
      setErrorToast(t.moderation.guestOnly);
      return;
    }
    const {
      error
    } = await supabase.rpc('report_content', {
      p_reporter_nickname: nickname,
      p_password_hash: passwordHash,
      p_target_nickname: reportTarget.author,
      p_content_type: reportTarget.type,
      p_content_id: reportTarget.id ? String(reportTarget.id) : null,
      p_content_snapshot: reportTarget.snapshot || null,
      p_reason: reportReason,
      p_details: reportNotes || null
    });
    setReportTarget(null);
    setReportNotes('');
    setReportReason('spam');
    if (error) setErrorToast(error.message);else setInfoToast(t.moderation.reportDone);
  };
  const moderationMenu = ({
    author,
    type,
    id,
    snapshot
  }) => {
    if (!author || author === nickname) return null;
    const key = `${type}:${id || author}`;
    const open = openMenu && openMenu.key === key;
    const apri = e => {
      e.stopPropagation();
      if (isGuest) {
        setErrorToast(t.moderation.guestOnly);
        return;
      }
      if (open) {
        setOpenMenu(null);
        return;
      }
      const r = e.currentTarget.getBoundingClientRect();
      const flipUp = window.innerHeight - r.bottom < 110;
      setOpenMenu({
        key,
        author,
        type,
        id,
        snapshot,
        top: flipUp ? null : r.bottom + 4,
        bottom: flipUp ? window.innerHeight - r.top + 4 : null,
        right: Math.min(Math.max(8, window.innerWidth - 184), Math.max(8, window.innerWidth - r.right))
      });
    };
    return React.createElement("span", {
      style: {
        marginLeft: 'auto'
      }
    }, React.createElement("button", {
      "aria-label": t.moderation.menu,
      "aria-expanded": !!open,
      onClick: apri,
      className: "text-secondary",
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '1.1rem',
        lineHeight: 1,
        padding: '0.25rem 0.5rem',
        minHeight: '32px'
      }
    }, "\u22EF"));
  };
  const matchIdRef = React.useRef(null);
  const sessionIdRef = React.useRef(null);
  React.useEffect(() => {
    matchIdRef.current = matchId;
  }, [matchId]);
  React.useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  const passwordHashRef = React.useRef(null);
  const invitoInUscitaRef = React.useRef(null);
  const attesaInvitanteRef = React.useRef(null);
  React.useEffect(() => {
    passwordHashRef.current = passwordHash;
  }, [passwordHash]);
  React.useEffect(() => {
    invitoInUscitaRef.current = invitoInUscita;
  }, [invitoInUscita]);
  React.useEffect(() => {
    attesaInvitanteRef.current = attesaInvitante;
  }, [attesaInvitante]);
  const IH = typeof InvitiHelpers !== 'undefined' ? InvitiHelpers : null;
  const testoInviti = (chiave, valori) => IH ? IH.testo(chiave, lang === 'it' ? 'it' : 'en', valori) : String(chiave);
  const rpcInviti = async (fn, extra) => {
    const {
      data,
      error
    } = await supabase.rpc(fn, {
      p_session_id: sessionIdRef.current || sessionId,
      p_password_hash: passwordHashRef.current || null,
      ...(extra || {})
    });
    if (error) return {
      ok: false,
      motivo: IH ? IH.chiaveDaErrore(error) : 'errore'
    };
    return data;
  };
  const aggiornaInviti = async () => {
    const r = await rpcInviti('get_my_telepathy_invites', {});
    if (!r || !r.ok) return null;
    if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
    const a = r.in_arrivo;
    setIncomingInvite(a && !isBlocked(a.nome) ? {
      from_id: a.from_id,
      from_name: a.nome,
      invite_id: a.id,
      expires_at: a.expires_at
    } : null);
    return r;
  };
  React.useEffect(() => {
    if (giroInviti) aggiornaInviti();
  }, [giroInviti]);
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const ascolta = ev => {
      const d = ev.data || {};
      if (d.tipo === 'apri-invito') {
        const letto = IH ? IH.leggiInvitoDaUrl('?invito=' + encodeURIComponent(String(d.invito || ''))) : null;
        if (letto) setInvitoDaAprire({
          invito: letto.invito,
          azione: d.azione === 'blocca' ? 'blocca' : null
        });
        setGiroInviti(x => x + 1);
        if (ev.ports && ev.ports[0]) ev.ports[0].postMessage({
          ok: true
        });
        return;
      }
      if (['invito', 'accettato', 'rifiutato', 'scaduto'].includes(d.tipo)) setGiroInviti(x => x + 1);
    };
    navigator.serviceWorker.addEventListener('message', ascolta);
    return () => navigator.serviceWorker.removeEventListener('message', ascolta);
  }, []);
  React.useEffect(() => {
    if (!invitoInUscita && !attesaInvitante) return;
    setAdessoLocale(Date.now());
    const t = setInterval(() => setAdessoLocale(Date.now()), 1000);
    return () => clearInterval(t);
  }, [invitoInUscita, attesaInvitante]);
  React.useEffect(() => {
    if (!avvisoInviti) return;
    const t = setTimeout(() => setAvvisoInviti(null), 6000);
    return () => clearTimeout(t);
  }, [avvisoInviti]);
  React.useEffect(() => {
    const handleUnload = () => {
      const opts = {
        method: 'DELETE',
        headers: SB_HEADERS,
        keepalive: true
      };
      const mid = matchIdRef.current;
      const sid = sessionIdRef.current;
      try {
        if (mid) {
          fetch(`${SUPABASE_URL}/rest/v1/telepathy_matches?id=eq.${mid}`, opts);
          fetch(`${SUPABASE_URL}/rest/v1/telepathy_chat?match_id=eq.${mid}`, opts);
        }
        if (sid) {
          fetch(`${SUPABASE_URL}/rest/v1/telepathy_queue?id=eq.${sid}`, opts);
        }
      } catch (e) {}
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);
  useEffect(() => {
    if (localStorage.getItem('ga_email')) return;
    const score = localStorage.getItem('telepathy_score');
    const best = localStorage.getItem('telepathy_best');
    if (score) setTotalRounds(parseInt(score));
    if (best) setTotalMatches(parseInt(best));
  }, []);
  useEffect(() => {
    if (!showEditProfile || !isGuest || !sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data
        } = await supabase.rpc('get_my_telepathy_totals', {
          p_user_id: sessionId,
          p_password_hash: null
        });
        if (cancelled || !data || data.length === 0) return;
        const r = data[0].rounds_count || 0;
        const m = data[0].matches_count || 0;
        setTotalRounds(r);
        setTotalMatches(m);
        localStorage.setItem('telepathy_score', String(r));
        localStorage.setItem('telepathy_best', String(m));
      } catch (e) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [showEditProfile, isGuest, sessionId]);
  useEffect(() => {
    if (!nickname) return;
    const myLat = 20 + Math.random() * 50;
    const myLng = -120 + Math.random() * 200;
    const updatePresence = async () => {
      try {
        const {
          error: upsertError
        } = await supabase.from('online_users').upsert({
          id: sessionId,
          nickname: nickname || 'Anonymous',
          lat: myLat,
          lng: myLng,
          last_seen: new Date().toISOString()
        });
        if (upsertError) console.warn('Presence upsert error:', upsertError);
        await supabase.from('online_users').delete().lt('last_seen', new Date(Date.now() - 120000).toISOString());
        const {
          data,
          error: fetchError
        } = await supabase.from('online_users').select('*');
        if (fetchError) {
          console.warn('Fetch online users error:', fetchError);
          setOnlineUsers([{
            id: sessionId,
            nickname,
            lat: myLat,
            lng: myLng
          }]);
        } else {
          const sortedByDate = (data || []).slice().sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
          const seenNicks = new Set();
          const uniqueUsers = [];
          for (const u of sortedByDate) {
            if (!seenNicks.has(u.nickname)) {
              seenNicks.add(u.nickname);
              uniqueUsers.push(u);
            }
          }
          setOnlineUsers(uniqueUsers.length > 0 ? uniqueUsers : [{
            id: sessionId,
            nickname,
            lat: myLat,
            lng: myLng
          }]);
          const {
            data: activeMatches
          } = await supabase.from('telepathy_matches').select('*');
          const busyIds = new Set();
          if (activeMatches) {
            activeMatches.forEach(m => {
              if (m.ended_at) return;
              busyIds.add(m.user1_id);
              busyIds.add(m.user2_id);
            });
          }
          const usersWithStatus = uniqueUsers.map(u => ({
            ...u,
            status: busyIds.has(u.id) ? 'busy' : 'available'
          }));
          setOnlineUsersForTelepathy(usersWithStatus.filter(u => u.nickname !== nickname && !isBlocked(u.nickname)));
          await aggiornaInviti();
        }
      } catch (err) {
        console.warn('Presence update failed:', err);
        setOnlineUsers([{
          id: sessionId,
          nickname,
          lat: myLat,
          lng: myLng
        }]);
      }
    };
    updatePresence();
    const interval = setInterval(updatePresence, 4000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') updatePresence();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.from('online_users').delete().eq('id', sessionId);
    };
  }, [nickname, sessionId]);
  useEffect(() => {
    const loadData = async () => {
      const {
        data: ritualsData
      } = await supabase.from('rituali_correnti').select('*').order('created_at', {
        ascending: false
      });
      if (ritualsData) {
        const now = new Date();
        const expired = ritualsData.filter(r => {
          const endTime = new Date(new Date(`${r.date}T${r.time}Z`).getTime() + r.duration * 60000);
          return now > endTime;
        });
        if (expired.length > 0) {
          await supabase.rpc('cleanup_expired_rituals');
        }
        setRituals(ritualsData.filter(r => !expired.find(e => e.id === r.id) && !isBlocked(r.creator)));
      }
      const {
        data: postsData
      } = await supabase.from('consciousness_posts').select('*').order('created_at', {
        ascending: false
      }).limit(50);
      if (postsData) setPosts(postsData.filter(x => !isBlocked(x.author_nickname)));
      if (expandedPostIdRef.current) {
        const {
          data: commentsData
        } = await supabase.from('consciousness_comments').select('*').eq('post_id', expandedPostIdRef.current).order('created_at', {
          ascending: true
        });
        if (commentsData) setCommentsMap(prev => ({
          ...prev,
          [expandedPostIdRef.current]: commentsData.filter(x => !isBlocked(x.author_nickname))
        }));
      }
      if (expandedRitualIdRef.current) {
        const {
          data: rCommentsData
        } = await supabase.from('ritual_comments').select('*').eq('ritual_id', expandedRitualIdRef.current).order('created_at', {
          ascending: true
        });
        if (rCommentsData) setRitualCommentsMap(prev => ({
          ...prev,
          [expandedRitualIdRef.current]: rCommentsData.filter(x => !isBlocked(x.author_nickname))
        }));
      }
    };
    loadData();
    const interval = setInterval(loadData, 10000);
    const ritualsChannel = supabase.channel('rituals-channel').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'rituals'
    }, () => loadData()).subscribe();
    return () => {
      clearInterval(interval);
      ritualsChannel.unsubscribe();
    };
  }, []);
  const [queuePosition, setQueuePosition] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  useEffect(() => {
    if (!searchingPartner) return;
    const findPartner = async () => {
      await supabase.from('telepathy_queue').delete().lt('timestamp', Date.now() - 60000);
      const adesso = Date.now();
      await supabase.from('telepathy_matches').delete().lt('ended_at', new Date(adesso - 60000).toISOString());
      await supabase.from('telepathy_matches').delete().lt('ultima_attivita', new Date(adesso - 600000).toISOString());
      await supabase.from('telepathy_matches').delete().eq('giocato', false).lt('created_at', new Date(adesso - 300000).toISOString());
      const vivo = m => !m.ended_at && !(m.da_invito && !m.giocato);
      const {
        data: matches
      } = await supabase.from('telepathy_matches').select('*');
      if (matches) {
        const myMatch = matches.find(m => (m.user1_id === sessionId || m.user2_id === sessionId) && vivo(m));
        if (myMatch) {
          const amUser1 = myMatch.user1_id === sessionId;
          const altroNick = amUser1 ? myMatch.user2_nickname : myMatch.user1_nickname;
          if (isBlocked(altroNick)) {
            try {
              await supabase.rpc('end_telepathy_match', {
                p_match_id: myMatch.id,
                p_ended_by: sessionId
              });
            } catch (e) {}
            return;
          }
          setPartner({
            id: amUser1 ? myMatch.user2_id : myMatch.user1_id,
            nickname: altroNick
          });
          setRole(amUser1 ? myMatch.user1_role : myMatch.user2_role);
          setMatchId(myMatch.id);
          setSearchingPartner(false);
          await supabase.from('telepathy_queue').delete().eq('id', sessionId);
          return;
        }
      }
      const {
        data: queue
      } = await supabase.from('telepathy_queue').select('*').neq('id', sessionId).order('timestamp', {
        ascending: true
      });
      const queueLibera = (queue || []).filter(q => !isBlocked(q.nickname));
      if (queueLibera.length > 0) {
        const available = queueLibera[0];
        const {
          data: precheck
        } = await supabase.from('telepathy_matches').select('*');
        const existingForMe = (precheck || []).find(m => (m.user1_id === sessionId || m.user2_id === sessionId) && vivo(m));
        if (existingForMe) {
          const amUser1 = existingForMe.user1_id === sessionId;
          setPartner({
            id: amUser1 ? existingForMe.user2_id : existingForMe.user1_id,
            nickname: amUser1 ? existingForMe.user2_nickname : existingForMe.user1_nickname
          });
          setRole(amUser1 ? existingForMe.user1_role : existingForMe.user2_role);
          setMatchId(existingForMe.id);
          setSearchingPartner(false);
          await supabase.from('telepathy_queue').delete().eq('id', sessionId);
          return;
        }
        const existingForThem = (precheck || []).find(m => (m.user1_id === available.id || m.user2_id === available.id) && vivo(m));
        if (existingForThem) {
          return;
        }
        const myRole = Math.random() > 0.5 ? 'sender' : 'receiver';
        const theirRole = myRole === 'sender' ? 'receiver' : 'sender';
        const {
          data: matchData
        } = await supabase.from('telepathy_matches').insert({
          user1_id: available.id,
          user1_nickname: available.nickname,
          user1_role: theirRole,
          user2_id: sessionId,
          user2_nickname: nickname || 'Anonymous',
          user2_role: myRole,
          level: 'lvl3'
        });
        if (!matchData || matchData.length === 0) {
          const {
            data: staleAll
          } = await supabase.from('telepathy_matches').select('*');
          for (const m of staleAll || []) {
            const isPair = m.user1_id === sessionId && m.user2_id === available.id || m.user1_id === available.id && m.user2_id === sessionId;
            if (isPair && m.ended_at) await supabase.from('telepathy_matches').delete().eq('id', m.id);
          }
          return;
        }
        const {
          data: postcheck
        } = await supabase.from('telepathy_matches').select('*');
        const pairMatches = (postcheck || []).filter(m => !m.ended_at && (m.user1_id === sessionId && m.user2_id === available.id || m.user2_id === sessionId && m.user1_id === available.id));
        let winner = matchData[0];
        if (pairMatches.length > 1) {
          pairMatches.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          winner = pairMatches[0];
          for (const m of pairMatches) {
            if (m.id !== winner.id) {
              await supabase.from('telepathy_matches').delete().eq('id', m.id);
            }
          }
        }
        const amUser1 = winner.user1_id === sessionId;
        setPartner({
          id: amUser1 ? winner.user2_id : winner.user1_id,
          nickname: amUser1 ? winner.user2_nickname : winner.user1_nickname
        });
        setRole(amUser1 ? winner.user1_role : winner.user2_role);
        setMatchId(winner.id);
        await supabase.from('telepathy_queue').delete().eq('id', sessionId);
        await supabase.from('telepathy_queue').delete().eq('id', available.id);
        setSearchingPartner(false);
      } else {
        await supabase.from('telepathy_queue').upsert({
          id: sessionId,
          nickname: nickname || 'Anonymous',
          timestamp: Date.now()
        });
        const {
          data: allQueue
        } = await supabase.from('telepathy_queue').select('*').order('timestamp', {
          ascending: true
        });
        if (allQueue) {
          setQueueSize(allQueue.length);
          const myPos = allQueue.findIndex(q => q.id === sessionId);
          setQueuePosition(myPos >= 0 ? myPos + 1 : 0);
        }
      }
    };
    findPartner();
    const interval = setInterval(findPartner, 2000);
    return () => {
      clearInterval(interval);
      if (searchingPartner) {
        supabase.from('telepathy_queue').delete().eq('id', sessionId);
      }
    };
  }, [searchingPartner, nickname]);
  const handleEnterGuest = () => {
    const name = tempNickname.trim() || 'Anonymous';
    localStorage.setItem('ga_nickname', name);
    localStorage.setItem('ga_is_guest', 'true');
    localStorage.setItem('ga_session_id', sessionId);
    localStorage.removeItem('ga_email');
    setNickname(name);
    setIsGuest(true);
    setUserEmail('');
    setShowNicknamePrompt(false);
    setLoginError('');
    setLoginSuccess('');
  };
  const mergeGuestTelepathyData = async (oldSid, newUserId, currentNickname, credenziale) => {
    if (!oldSid || !newUserId || oldSid === newUserId || !credenziale) return null;
    const {
      data,
      error
    } = await supabase.rpc('merge_telepathy_scores', {
      p_old_user_id: oldSid,
      p_new_user_id: newUserId,
      p_nickname: currentNickname || 'Anonymous',
      p_password_hash: credenziale
    });
    if (error) {
      console.warn('merge_telepathy_scores rpc failed', error);
      return null;
    }
    if (!Array.isArray(data) || data.length === 0) return null;
    const row = data[0];
    return {
      rounds_count: row.out_rounds || 0,
      matches_count: row.out_matches || 0,
      sessions_count: row.out_sessions || 0
    };
  };
  const handleLogin = async () => {
    const email = tempEmail.trim().toLowerCase();
    const pw = tempPassword.trim();
    if (!email || !pw) {
      setLoginError(t.fillAllFields);
      return;
    }
    if (!isValidEmail(email)) {
      setLoginError(t.invalidEmail);
      return;
    }
    setLoginError('');
    setLoginSuccess('');
    const prevGuestSid = sessionId;
    const wasGuest = !userEmail;
    setAuthLoading(true);
    let esito;
    let effectiveHash;
    try {
      const {
        data: par,
        error: parErr
      } = await supabase.rpc('get_login_params', {
        p_email: email
      });
      if (parErr || !par || !par.salt) throw new Error('params');
      const salt = Uint8Array.from(atob(par.salt), c => c.charCodeAt(0));
      effectiveHash = await deriveStrongHash(pw, salt, par.iter);
      const legacyHash = await hashPassword(pw);
      const {
        data,
        error
      } = await supabase.rpc('login_with_password', {
        p_email: email,
        p_hash: effectiveHash,
        p_legacy_hash: legacyHash
      });
      if (error || !data) throw new Error('login');
      esito = data;
    } catch (e) {
      setLoginError(t.connectionError);
      setAuthLoading(false);
      return;
    }
    if (!esito.ok) {
      setLoginError(esito.motivo === 'troppi_tentativi' ? t.tooManyAttempts : t.invalidCredentials);
      setAuthLoading(false);
      return;
    }
    const existing = esito.profilo;
    if (existing.session_id !== sessionId) await spegniDisponibilitaDi(sessionId, passwordHash);
    setSessionId(existing.session_id);
    localStorage.setItem('ga_session_id', existing.session_id);
    setPasswordHash(effectiveHash);
    localStorage.setItem('ga_pwhash', effectiveHash);
    setUserEmail(email);
    setIsGuest(false);
    const loaded = {
      bio: existing.bio || '',
      starseedType: existing.starseed_type || '',
      avatar: existing.avatar || '',
      country: existing.country || '',
      interests: existing.interests || [],
      experienceLevel: existing.experience_level || ''
    };
    setProfile(loaded);
    localStorage.setItem('ga_profile', JSON.stringify(loaded));
    localStorage.setItem('ga_nickname', existing.nickname || 'Anonymous');
    localStorage.setItem('ga_email', email);
    localStorage.setItem('ga_is_guest', 'false');
    if (existing.telepathy_score) setTotalRounds(existing.telepathy_score);
    if (existing.telepathy_best) setTotalMatches(existing.telepathy_best);
    setNickname(existing.nickname || 'Anonymous');
    setShowNicknamePrompt(false);
    if (wasGuest) {
      const merged = await mergeGuestTelepathyData(prevGuestSid, email, existing.nickname || 'Anonymous', effectiveHash);
      if (merged) {
        setTotalRounds(merged.rounds_count);
        setTotalMatches(merged.matches_count);
        localStorage.setItem('telepathy_score', String(merged.rounds_count));
        localStorage.setItem('telepathy_best', String(merged.matches_count));
        await supabase.rpc('update_my_profile', {
          p_nickname: existing.nickname,
          p_password_hash: effectiveHash,
          p_fields: {
            telepathy_score: merged.rounds_count,
            telepathy_best: merged.matches_count
          }
        });
      }
    }
    setAuthLoading(false);
  };
  const handleRegister = async () => {
    const name = tempNickname.trim();
    const email = tempEmail.trim().toLowerCase();
    const pw = tempPassword.trim();
    if (!name || !email || !pw) {
      setLoginError(t.fillAllFields);
      return;
    }
    if (!isValidEmail(email)) {
      setLoginError(t.invalidEmail);
      return;
    }
    setLoginError('');
    setLoginSuccess('');
    setAuthLoading(true);
    const prevGuestSid = sessionId;
    const wasGuest = !userEmail;
    let hash;
    try {
      hash = await deriveStrongHash(pw);
    } catch (e) {
      setLoginError(t.connectionError);
      setAuthLoading(false);
      return;
    }
    const newSid = Date.now() + '-' + Math.random();
    const {
      data: reg,
      error: regErr
    } = await supabase.rpc('register_account', {
      p_session_id: newSid,
      p_nickname: name,
      p_email: email,
      p_hash: hash
    });
    if (regErr || !reg) {
      setLoginError(t.connectionError);
      setAuthLoading(false);
      return;
    }
    if (!reg.ok) {
      const msg = {
        email_in_uso: t.emailAlreadyUsed,
        nickname_in_uso: t.usernameAlreadyUsed,
        troppi_tentativi: t.tooManyAttempts
      }[reg.motivo];
      setLoginError(msg || t.registrationError || 'Registration failed. Please try again.');
      setAuthLoading(false);
      return;
    }
    setPasswordHash(hash);
    localStorage.setItem('ga_pwhash', hash);
    await spegniDisponibilitaDi(sessionId, null);
    setSessionId(newSid);
    localStorage.setItem('ga_session_id', newSid);
    setLoginSuccess(t.newAccountCreated);
    localStorage.setItem('ga_nickname', name);
    localStorage.setItem('ga_email', email);
    localStorage.setItem('ga_is_guest', 'false');
    setNickname(name);
    setUserEmail(email);
    setIsGuest(false);
    setShowNicknamePrompt(false);
    if (wasGuest) {
      const merged = await mergeGuestTelepathyData(prevGuestSid, email, name, hash);
      if (merged) {
        setTotalRounds(merged.rounds_count);
        setTotalMatches(merged.matches_count);
        localStorage.setItem('telepathy_score', String(merged.rounds_count));
        localStorage.setItem('telepathy_best', String(merged.matches_count));
        await supabase.rpc('update_my_profile', {
          p_nickname: name,
          p_password_hash: hash,
          p_fields: {
            telepathy_score: merged.rounds_count,
            telepathy_best: merged.matches_count
          }
        });
      }
    }
    setAuthLoading(false);
  };
  const inviaEmailAccount = async (tipo, email) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-account-email`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({
          tipo,
          email
        })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  };
  const handleSendResetEmail = async () => {
    const email = resetEmail.trim().toLowerCase();
    if (!email) {
      setLoginError(t.fillAllFields);
      return;
    }
    if (!isValidEmail(email)) {
      setLoginError(t.invalidEmail);
      return;
    }
    setLoginError('');
    setLoginSuccess('');
    setAuthLoading(true);
    const ok = await inviaEmailAccount('reset', email);
    if (ok) {
      setLoginSuccess(t.resetEmailSent);
      setResetEmail('');
    } else setLoginError(t.connectionError);
    setAuthLoading(false);
  };
  const handleSetNewPassword = async () => {
    const pw = resetNewPassword.trim();
    const pw2 = resetConfirmPassword.trim();
    if (!pw || !pw2) {
      setLoginError(t.fillAllFields);
      return;
    }
    if (pw !== pw2) {
      setLoginError(t.passwordsNoMatch);
      return;
    }
    setLoginError('');
    setLoginSuccess('');
    try {
      setAuthLoading(true);
      const hash = await deriveStrongHash(pw);
      const {
        data: esito,
        error
      } = await supabase.rpc('reset_password', {
        p_token: resetToken,
        p_new_hash: hash
      });
      if (error || !esito) {
        setLoginError(t.connectionError);
        setAuthLoading(false);
        return;
      }
      if (!esito.ok) {
        setLoginError(t.resetTokenInvalid);
        setResetToken('');
        setAuthLoading(false);
        return;
      }
      setLoginSuccess(t.resetSuccess);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setResetToken('');
      setTimeout(() => {
        setAuthTab('login');
        setLoginSuccess('');
      }, 2500);
    } catch (err) {
      setLoginError(t.connectionError);
    } finally {
      setAuthLoading(false);
    }
  };
  const handleSendMagicLink = async () => {
    const email = magicLinkEmail.trim().toLowerCase();
    if (!email) {
      setLoginError(t.fillAllFields);
      return;
    }
    if (!isValidEmail(email)) {
      setLoginError(t.invalidEmail);
      return;
    }
    setLoginError('');
    setLoginSuccess('');
    setAuthLoading(true);
    const ok = await inviaEmailAccount('magic', email);
    if (ok) {
      setLoginSuccess(t.magicLinkSent);
      setMagicLinkEmail('');
      setShowMagicLink(false);
    } else setLoginError(t.connectionError);
    setAuthLoading(false);
  };
  useEffect(() => {
    if (!magicToken) return;
    const loginWithMagicToken = async () => {
      const prevGuestSid = sessionId;
      const wasGuest = !userEmail;
      const {
        data: esito,
        error
      } = await supabase.rpc('consume_magic_link', {
        p_token: magicToken
      });
      if (error || !esito) {
        setLoginError(t.connectionError);
        return;
      }
      if (!esito.ok) {
        setLoginError(t.magicLinkInvalid);
        return;
      }
      const existing = esito.profilo;
      const email = existing.email;
      const credenziale = esito.password_hash;
      if (existing.session_id !== sessionId) await spegniDisponibilitaDi(sessionId, passwordHash);
      setSessionId(existing.session_id);
      localStorage.setItem('ga_session_id', existing.session_id);
      setUserEmail(email);
      setIsGuest(false);
      setPasswordHash(credenziale);
      localStorage.setItem('ga_pwhash', credenziale);
      const loaded = {
        bio: existing.bio || '',
        starseedType: existing.starseed_type || '',
        avatar: existing.avatar || '',
        country: existing.country || '',
        interests: existing.interests || [],
        experienceLevel: existing.experience_level || ''
      };
      setProfile(loaded);
      localStorage.setItem('ga_profile', JSON.stringify(loaded));
      localStorage.setItem('ga_nickname', existing.nickname || 'Anonymous');
      localStorage.setItem('ga_email', email);
      localStorage.setItem('ga_is_guest', 'false');
      if (existing.telepathy_score) setTotalRounds(existing.telepathy_score);
      if (existing.telepathy_best) setTotalMatches(existing.telepathy_best);
      setNickname(existing.nickname || 'Anonymous');
      setShowNicknamePrompt(false);
      if (wasGuest) {
        const merged = await mergeGuestTelepathyData(prevGuestSid, email, existing.nickname || 'Anonymous', credenziale);
        if (merged) {
          setTotalRounds(merged.rounds_count);
          setTotalMatches(merged.matches_count);
          localStorage.setItem('telepathy_score', String(merged.rounds_count));
          localStorage.setItem('telepathy_best', String(merged.matches_count));
          await supabase.rpc('update_my_profile', {
            p_nickname: existing.nickname,
            p_password_hash: credenziale,
            p_fields: {
              telepathy_score: merged.rounds_count,
              telepathy_best: merged.matches_count
            }
          });
        }
      }
    };
    loginWithMagicToken();
  }, [magicToken]);
  const handleLogout = () => {
    spegniDisponibilitaDi(sessionId, passwordHash);
    spegniPushAlLogout();
    localStorage.removeItem('ga_nickname');
    localStorage.removeItem('ga_email');
    localStorage.removeItem('ga_is_guest');
    localStorage.removeItem('ga_profile');
    localStorage.removeItem('ga_session_id');
    localStorage.removeItem('telepathy_score');
    localStorage.removeItem('telepathy_best');
    setNickname('');
    setUserEmail('');
    setIsGuest(false);
    setPasswordHash(null);
    localStorage.removeItem('ga_pwhash');
    setBlockedUsers([]);
    localStorage.removeItem('ga_blocked');
    setTempNickname('');
    setTempEmail('');
    setTempPassword('');
    setLoginError('');
    setLoginSuccess('');
    setAuthTab('guest');
    setProfile({
      bio: '',
      starseedType: '',
      avatar: '',
      country: '',
      interests: [],
      experienceLevel: ''
    });
    setTotalRounds(0);
    setTotalMatches(0);
    setSessionMatches(0);
    setRoundCount(0);
    setShowNicknamePrompt(true);
  };
  const exportMyData = async () => {
    if (gdprBusy) return;
    setGdprBusy(true);
    const {
      data,
      error
    } = await supabase.rpc('export_my_account', {
      p_nickname: nickname,
      p_password_hash: passwordHash
    });
    setGdprBusy(false);
    if (error || !data) {
      showErrorToast(t.gdprExportError);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `global-awakening-dati-${nickname}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const confirmDeleteAccount = async () => {
    if (gdprBusy) return;
    setGdprBusy(true);
    const {
      error
    } = await supabase.rpc('delete_my_account', {
      p_nickname: nickname,
      p_password_hash: passwordHash
    });
    setGdprBusy(false);
    if (error) {
      showErrorToast(t.gdprDeleteError);
      return;
    }
    setShowDeleteAccount(false);
    setDeleteConfirmText('');
    setShowEditProfile(false);
    handleLogout();
  };
  const startSearching = () => {
    setSearchingPartner(true);
    setPartner(null);
    setRole(null);
    setSelectedSymbol(null);
    setGuessedSymbol(null);
    setShowResult(false);
  };
  const sendSymbol = async () => {
    if (!selectedSymbol || !matchId || attesaInvitanteRef.current) return;
    setWaitingForPartner(true);
    await supabase.from('telepathy_matches').update({
      sender_symbol: selectedSymbol,
      level: currentLevel
    }).eq('id', matchId);
  };
  const submitGuess = async () => {
    if (!guessedSymbol || !matchId || attesaInvitanteRef.current) return;
    setWaitingForPartner(true);
    await supabase.from('telepathy_matches').update({
      receiver_guess: guessedSymbol
    }).eq('id', matchId);
  };
  const proposeLevelChange = async choice => {
    const bannerRound = Math.floor(roundCount / 7) * 7;
    const newLevel = choice === 'keep' ? currentLevel : choice;
    setCurrentLevel(newLevel);
    setShowLevelBanner(false);
    lastProcessedRoundRef.current = -1;
    await supabase.from('telepathy_matches').update({
      level: newLevel,
      level_change_choice_sender: 'r' + bannerRound
    }).eq('id', matchId);
  };
  useEffect(() => {
    if (!matchId || !waitingForPartner) return;
    const pollResult = async () => {
      const {
        data
      } = await supabase.from('telepathy_matches').select('*').eq('id', matchId);
      if (matchIdRef.current !== matchId) return;
      if (!data || data.length === 0) {
        setPartnerDisconnected(true);
        setSessionEnded(true);
        setShowResult(false);
        setWaitingForPartner(false);
        return;
      }
      const match = data[0];
      if (match.ended_at) {
        if (match.ended_by && match.ended_by !== sessionId) setPartnerDisconnected(true);
        setSessionEnded(true);
        setShowResult(false);
        setWaitingForPartner(false);
        return;
      }
      if (match.user1_id) setMatchUser1Id(match.user1_id);
      const dbRound = match.round_count || 0;
      if (match.sender_symbol && match.receiver_guess && dbRound > lastProcessedRoundRef.current) {
        lastProcessedRoundRef.current = dbRound;
        const isTelepathicMatch = match.sender_symbol === match.receiver_guess;
        setPartnerSymbol(effectiveRole === 'sender' ? match.receiver_guess : match.sender_symbol);
        setIsMatch(isTelepathicMatch);
        setShowResult(true);
        setWaitingForPartner(false);
        if (effectiveRole === 'receiver') {
          supabase.rpc('log_telepathy_trial', {
            p_match_id: matchId,
            p_round: dbRound,
            p_sender_id: partner?.id || null,
            p_receiver_id: userEmail || guestCode,
            p_mode: currentLevel,
            p_card_count: cardCountForLevel(currentLevel),
            p_target: match.sender_symbol,
            p_guess: match.receiver_guess,
            p_is_hit: isTelepathicMatch
          }).then(({
            error
          }) => {
            if (error) console.warn('log_telepathy_trial failed', error);
          }).catch(() => {});
        }
        setResultRole(effectiveRole);
        setResultLevel(currentLevel);
        const newRound = (match.round_count || 0) + 1;
        const newSessionMatches = sessionMatchesRef.current + (isTelepathicMatch ? 1 : 0);
        setRoundCount(newRound);
        setSessionMatches(newSessionMatches);
        if (effectiveRole === 'sender') {
          setTimeout(async () => {
            await supabase.from('telepathy_matches').update({
              round_count: newRound,
              sender_symbol: null,
              receiver_guess: null
            }).eq('id', matchId);
          }, 4000);
        }
        if (newRound >= 7 && newRound % 7 === 0) {
          setShowLevelBanner(true);
        }
      }
    };
    pollResult();
    const interval = setInterval(pollResult, 2000);
    return () => clearInterval(interval);
  }, [matchId, waitingForPartner, role, effectiveRole, currentLevel]);
  useEffect(() => {
    if (partner && !sessionEnded && roundCount > 0 && roundCount % 3 === 0) {
      setRoleSwapOverlay(effectiveRole);
      const tmr = setTimeout(() => setRoleSwapOverlay(null), 2200);
      return () => clearTimeout(tmr);
    }
    setRoleSwapOverlay(null);
  }, [roundCount, partner, sessionEnded, effectiveRole]);
  useEffect(() => {
    if (!matchId) return;
    const checkPartnerLeft = async () => {
      let data, error;
      if (endedColumnsSupportedRef.current) {
        ({
          data,
          error
        } = await supabase.from('telepathy_matches').select('id, ended_at, ended_by').eq('id', matchId));
        if (error) endedColumnsSupportedRef.current = false;
      }
      if (!endedColumnsSupportedRef.current) {
        ({
          data
        } = await supabase.from('telepathy_matches').select('id').eq('id', matchId));
      }
      if (matchIdRef.current !== matchId) return;
      if (!data || data.length === 0) {
        setPartnerDisconnected(true);
        setSessionEnded(true);
        setShowResult(false);
        setWaitingForPartner(false);
        return;
      }
      const match = data[0];
      if (match.ended_at) {
        if (match.ended_by && match.ended_by !== sessionId) setPartnerDisconnected(true);
        setSessionEnded(true);
        setShowResult(false);
        setWaitingForPartner(false);
        return;
      }
      if (partner?.id && !attesaInvitanteRef.current) {
        const {
          data: pu
        } = await supabase.from('online_users').select('last_seen').eq('id', partner.id);
        if (pu && pu.length > 0) {
          const stale = Date.now() - new Date(pu[0].last_seen).getTime() > 35000;
          if (stale && matchIdRef.current === matchId) setPartnerDisconnected(true);
        }
      }
    };
    const interval = setInterval(checkPartnerLeft, 2000);
    return () => clearInterval(interval);
  }, [matchId, partner]);
  useEffect(() => {
    if (!matchId || !showLevelBanner) return;
    const pollLevelChange = async () => {
      const {
        data
      } = await supabase.from('telepathy_matches').select('*').eq('id', matchId);
      if (!data || data.length === 0) return;
      const match = data[0];
      if (match.user1_id) setMatchUser1Id(match.user1_id);
      const bannerRound = Math.floor(roundCount / 7) * 7;
      if (match.level_change_choice_sender === 'r' + bannerRound) {
        if (match.level && match.level !== currentLevel) setCurrentLevel(match.level);
        setShowLevelBanner(false);
        lastProcessedRoundRef.current = -1;
      }
    };
    pollLevelChange();
    const interval = setInterval(pollLevelChange, 2000);
    return () => clearInterval(interval);
  }, [matchId, showLevelBanner, currentLevel, roundCount]);
  const entraNelMatchDaInvito = async (idMatch, gia) => {
    let m = gia;
    if (!m) {
      const {
        data,
        error
      } = await supabase.from('telepathy_matches').select('*').eq('id', idMatch);
      if (error || !Array.isArray(data)) return null;
      m = data[0];
    }
    if (!m || m.ended_at) {
      setDirectInviteTarget(null);
      setInvitoInUscita(null);
      setAvvisoInviti(testoInviti('non_ce_piu'));
      return false;
    }
    await supabase.from('telepathy_matches').update({
      round_count: m.round_count || 0
    }).eq('id', m.id);
    const amUser1 = m.user1_id === sessionId;
    setPartner({
      id: amUser1 ? m.user2_id : m.user1_id,
      nickname: amUser1 ? m.user2_nickname : m.user1_nickname
    });
    setRole(amUser1 ? m.user1_role : m.user2_role);
    setMatchId(m.id);
    setSessionEnded(false);
    setPartnerDisconnected(false);
    setDirectInviteTarget(null);
    setInvitoInUscita(null);
    setActiveTab('telepathy');
    return true;
  };
  useEffect(() => {
    if (!invitoInUscita || partner) return;
    let fermo = false;
    let inCorso = false;
    const giro = async () => {
      if (inCorso) return;
      inCorso = true;
      try {
        const r = await rpcInviti('get_my_telepathy_invites', {});
        if (fermo || !r || !r.ok) return;
        if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
        const u = r.in_uscita;
        if (!u || u.id !== invitoInUscita.id) {
          setDirectInviteTarget(null);
          setInvitoInUscita(null);
          setAvvisoInviti(testoInviti('invito_sparito'));
          return;
        }
        if (u.status === 'pending') {
          setInvitoInUscita(u);
          return;
        }
        if (u.status === 'accepted') {
          if (u.match_id) {
            await entraNelMatchDaInvito(u.match_id);
            return;
          }
          const {
            data: miei,
            error: errMiei
          } = await supabase.from('telepathy_matches').select('*').eq('user1_id', sessionId);
          if (fermo || errMiei) return;
          const m = IH ? IH.matchDiRipiego(miei, sessionId, u.created_at) : null;
          if (m) await entraNelMatchDaInvito(m.id, m);
          return;
        }
        setDirectInviteTarget(null);
        setInvitoInUscita(null);
        setAvvisoInviti(testoInviti(IH ? IH.motivoDaStato(u.status) : 'scaduto', {
          nome: u.nome
        }));
      } finally {
        inCorso = false;
      }
    };
    giro();
    const intervallo = setInterval(giro, 2000);
    return () => {
      fermo = true;
      clearInterval(intervallo);
    };
  }, [invitoInUscita && invitoInUscita.id, partner, sessionId, giroInviti]);
  const rientroFattoRef = React.useRef(null);
  useEffect(() => {
    if (!nickname || !sessionId || partner || rientroFattoRef.current === sessionId) return;
    rientroFattoRef.current = sessionId;
    const sid = sessionId;
    const prova = async restano => {
      if (rientroFattoRef.current !== sid || matchIdRef.current) return;
      const riprova = () => {
        if (restano > 0) setTimeout(() => prova(restano - 1), 2000);
      };
      const r = await rpcInviti('get_my_telepathy_invites', {});
      if (!r || r.ok === false && r.motivo === 'errore') {
        riprova();
        return;
      }
      if (!r.ok || !r.in_uscita || !IH) return;
      const scarto = IH.scarto(r.adesso, Date.now());
      setScartoOrologio(scarto);
      const u = r.in_uscita;
      if (u.status === 'pending') {
        setInvitoInUscita(u);
        setDirectInviteTarget({
          id: null,
          nickname: u.nome
        });
        return;
      }
      if (u.status === 'accepted' && u.match_id && !IH.attesaFinita(u.responded_at, scarto, Date.now())) {
        if ((await entraNelMatchDaInvito(u.match_id)) === null) riprova();
      }
    };
    prova(5);
  }, [nickname, sessionId]);
  useEffect(() => {
    if (!matchId) return;
    const loadChat = async () => {
      const {
        data
      } = await supabase.from('telepathy_chat').select('*').eq('match_id', matchId).order('created_at', {
        ascending: true
      });
      if (data) setTelepathyChatMessages(data.filter(x => !isBlocked(x.sender_name)));
    };
    loadChat();
    const interval = setInterval(loadChat, 3000);
    return () => clearInterval(interval);
  }, [matchId]);
  useEffect(() => {
    if (!matchId || effectiveRole !== 'receiver' || waitingForPartner || showResult) return;
    const checkSenderSent = async () => {
      const {
        data
      } = await supabase.from('telepathy_matches').select('sender_symbol, round_count').eq('id', matchId);
      if (data && data.length > 0) {
        const dbRound = data[0].round_count || 0;
        setSenderHasSent(!!data[0].sender_symbol && dbRound === roundCount);
      }
    };
    checkSenderSent();
    const interval = setInterval(checkSenderSent, 2000);
    return () => clearInterval(interval);
  }, [matchId, role, effectiveRole, waitingForPartner, showResult, roundCount]);
  useEffect(() => {
    if (!showResult || sessionEnded || partnerDisconnected) {
      setResultCountdown(null);
      return;
    }
    setResultCountdown(4);
    const tick = setInterval(() => {
      setResultCountdown(c => c && c > 1 ? c - 1 : c);
    }, 1000);
    const advance = setTimeout(() => {
      setShowResult(false);
      setSelectedSymbol(null);
      setGuessedSymbol(null);
      setPartnerSymbol(null);
      setWaitingForPartner(false);
      setResultCountdown(null);
      setSenderHasSent(false);
    }, 4500);
    return () => {
      clearInterval(tick);
      clearTimeout(advance);
    };
  }, [showResult, sessionEnded, partnerDisconnected]);
  const resetTelepathy = () => {
    const oldMatchId = matchId;
    if (oldMatchId) {
      supabase.from('telepathy_matches').delete().eq('id', oldMatchId);
      supabase.from('telepathy_chat').delete().eq('match_id', oldMatchId);
    }
    if (sessionId) {
      supabase.from('telepathy_queue').delete().eq('id', sessionId);
    }
    const uscita = invitoInUscitaRef.current;
    if (uscita && uscita.status === 'pending') rpcInviti('cancel_telepathy_invite', {
      p_invite_id: uscita.id
    });
    invitoInUscitaRef.current = null;
    lastProcessedRoundRef.current = -1;
    setMatchUser1Id(null);
    setPartner(null);
    setRole(null);
    setSelectedSymbol(null);
    setGuessedSymbol(null);
    setShowResult(false);
    setWaitingForPartner(false);
    setMatchId(null);
    setPartnerSymbol(null);
    setCurrentLevel('lvl3');
    setRoundCount(0);
    setSessionMatches(0);
    setShowLevelBanner(false);
    setSessionEnded(false);
    setPartnerDisconnected(false);
    setDirectInviteTarget(null);
    setInvitoInUscita(null);
    setAttesaInvitante(null);
    setSenderHasSent(false);
    setTelepathyChatMessages([]);
    setNewTelepathyMessage('');
  };
  const leaveSession = async () => {
    if (roundCount > 0) {
      try {
        await supabase.rpc('increment_telepathy_score', {
          p_user_id: userEmail || sessionId,
          p_nickname: nickname || 'Anonymous',
          p_rounds: roundCount,
          p_matches: sessionMatches
        });
      } catch (e) {}
    }
    if (matchId) {
      try {
        await supabase.rpc('end_telepathy_match', {
          p_match_id: matchId,
          p_ended_by: sessionId
        });
      } catch (e) {}
    }
    resetTelepathy();
  };
  useEffect(() => {
    const waitingOnPartner = !!matchId && !attesaInvitante && !sessionEnded && !partnerDisconnected && !showResult && (waitingForPartner || showLevelBanner && !amIChooser || effectiveRole === 'receiver' && !senderHasSent);
    if (!waitingOnPartner) return;
    const timer = setTimeout(() => {
      leaveSession();
    }, 90000);
    return () => clearTimeout(timer);
  }, [matchId, sessionEnded, partnerDisconnected, showResult, waitingForPartner, showLevelBanner, amIChooser, effectiveRole, senderHasSent, roundCount, sessionMatches, attesaInvitante]);
  const invioInCorsoRef = React.useRef(false);
  const sendDirectInvite = async targetUser => {
    if (directInviteTarget || invitoInUscitaRef.current || invioInCorsoRef.current) return;
    invioInCorsoRef.current = true;
    try {
      await inviaInvito(targetUser);
    } finally {
      invioInCorsoRef.current = false;
    }
  };
  const inviaInvito = async targetUser => {
    setDirectInviteTarget(targetUser);
    const r = await rpcInviti('send_telepathy_invite', {
      p_nickname: nickname || 'Anonymous',
      p_disponibilita_id: targetUser.disponibilita_id || null,
      p_session_online: targetUser.disponibilita_id ? null : targetUser.id
    });
    if (!r || !r.ok) {
      setDirectInviteTarget(null);
      setAvvisoInviti(testoInviti(r && r.motivo || 'errore', {
        nome: targetUser.nickname
      }));
      return;
    }
    if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
    setAdessoLocale(Date.now());
    setInvitoInUscita({
      id: r.id,
      nome: targetUser.nickname,
      status: 'pending',
      expires_at: r.expires_at,
      created_at: r.created_at,
      push_saltata: r.push_saltata,
      match_id: null,
      responded_at: null
    });
    if (r.push_saltata) setAvvisoInviti(testoInviti('push_saltata'));
  };
  const cancelDirectInvite = async () => {
    const uscita = invitoInUscitaRef.current;
    setDirectInviteTarget(null);
    setInvitoInUscita(null);
    if (uscita) await rpcInviti('cancel_telepathy_invite', {
      p_invite_id: uscita.id
    });
  };
  const accettoInCorsoRef = React.useRef(false);
  const acceptInvite = async () => {
    if (!incomingInvite || accettoInCorsoRef.current) return;
    accettoInCorsoRef.current = true;
    try {
      await accettaInvito();
    } finally {
      accettoInCorsoRef.current = false;
    }
  };
  const accettaInvito = async () => {
    if ((matchId || partner) && !sessionEnded && !partnerDisconnected) return;
    if (matchId || partner) resetTelepathy();
    setSearchingPartner(false);
    const invito = incomingInvite;
    const {
      data: staleAccept
    } = await supabase.from('telepathy_matches').select('*');
    for (const m of staleAccept || []) {
      const isPair = m.user1_id === invito.from_id && m.user2_id === sessionId || m.user1_id === sessionId && m.user2_id === invito.from_id;
      if (isPair && m.ended_at) await supabase.from('telepathy_matches').delete().eq('id', m.id);
    }
    const myRole = Math.random() > 0.5 ? 'sender' : 'receiver';
    const theirRole = myRole === 'sender' ? 'receiver' : 'sender';
    const {
      data: matchData,
      error: matchError
    } = await supabase.from('telepathy_matches').insert({
      user1_id: invito.from_id,
      user1_nickname: invito.from_name,
      user1_role: theirRole,
      user2_id: sessionId,
      user2_nickname: nickname || 'Anonymous',
      user2_role: myRole,
      level: 'lvl3',
      round_count: 0,
      da_invito: true
    });
    if (matchError || !matchData || matchData.length === 0) {
      const stato = await rpcInviti('get_telepathy_invite', {
        p_invite_id: invito.invite_id
      });
      let motivo = 'match_non_valido';
      if (stato && stato.ok && stato.invito && stato.invito.status !== 'pending' && IH) motivo = IH.motivoDaStato(stato.invito.status);else if (stato && stato.ok === false && (stato.motivo === 'errore' || stato.motivo === 'auth_fallita')) motivo = stato.motivo;
      setIncomingInvite(null);
      setAvvisoInviti(testoInviti(motivo, {
        nome: invito.from_name
      }));
      return;
    }
    const nuovo = matchData[0];
    let r = await rpcInviti('respond_telepathy_invite', {
      p_invite_id: invito.invite_id,
      p_accept: true,
      p_match_id: nuovo.id
    });
    if (r && r.ok === false && r.motivo === 'errore') {
      const stato = await rpcInviti('get_telepathy_invite', {
        p_invite_id: invito.invite_id
      });
      if (stato && stato.ok && stato.invito && stato.invito.status === 'accepted' && stato.invito.match_id === nuovo.id) {
        r = {
          ok: true,
          status: 'accepted',
          responded_at: stato.invito.responded_at,
          adesso: stato.adesso
        };
      }
    }
    if (!r || !r.ok) {
      await supabase.from('telepathy_matches').delete().eq('id', nuovo.id);
      setIncomingInvite(null);
      setAvvisoInviti(testoInviti(r && r.motivo || 'errore', {
        nome: invito.from_name
      }));
      return;
    }
    if (IH && r.adesso) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
    invitoInUscitaRef.current = null;
    setInvitoInUscita(null);
    setDirectInviteTarget(null);
    setMatchId(nuovo.id);
    setPartner({
      id: invito.from_id,
      nickname: invito.from_name
    });
    setRole(myRole);
    setIncomingInvite(null);
    setAttesaInvitante({
      invitoId: invito.invite_id,
      respondedAt: r.responded_at,
      nome: invito.from_name
    });
    setSessionEnded(false);
    setPartnerDisconnected(false);
    setShowResult(false);
    setSelectedSymbol(null);
    setGuessedSymbol(null);
    setPartnerSymbol(null);
    setWaitingForPartner(false);
    setSenderHasSent(false);
    setRoundCount(0);
    setSessionMatches(0);
    setActiveTab('telepathy');
  };
  const declineInvite = async () => {
    const invito = incomingInvite;
    if (!invito) return;
    setIncomingInvite(null);
    const r = await rpcInviti('respond_telepathy_invite', {
      p_invite_id: invito.invite_id,
      p_accept: false,
      p_match_id: null
    });
    if (r && r.ok === false && r.motivo !== 'scaduto') setAvvisoInviti(testoInviti(r.motivo, {
      nome: invito.from_name
    }));
  };
  const rispostoIlRef = React.useRef(null);
  useEffect(() => {
    if (!attesaInvitante || !matchId || !partner) return;
    rispostoIlRef.current = attesaInvitante.respondedAt;
    let fermo = false;
    let inCorso = false;
    const giro = async () => {
      if (inCorso) return;
      inCorso = true;
      try {
        const {
          data: pu
        } = await supabase.from('online_users').select('last_seen').eq('id', partner.id);
        if (fermo) return;
        const visto = pu && pu.length > 0 ? Date.parse(pu[0].last_seen) : NaN;
        const risposto = Date.parse(rispostoIlRef.current);
        if (!isNaN(visto) && !isNaN(risposto) && visto > risposto + 5000 && Date.now() - visto < 30000) {
          setAttesaInvitante(null);
          return;
        }
        const {
          data: mm,
          error: errM
        } = await supabase.from('telepathy_matches').select('giocato').eq('id', matchId);
        if (fermo) return;
        if (!errM && Array.isArray(mm) && mm.length > 0 && mm[0].giocato === true) {
          setAttesaInvitante(null);
          return;
        }
        const r = await rpcInviti('get_telepathy_invite', {
          p_invite_id: attesaInvitante.invitoId
        });
        if (fermo) return;
        const scarto = r && r.adesso && IH ? IH.scarto(r.adesso, Date.now()) : scartoOrologio;
        if (r && r.ok && r.invito && r.invito.responded_at) rispostoIlRef.current = r.invito.responded_at;
        if (IH && IH.attesaFinita(rispostoIlRef.current, scarto, Date.now())) {
          fermo = true;
          try {
            await supabase.rpc('end_telepathy_match', {
              p_match_id: matchId,
              p_ended_by: sessionId
            });
          } catch (_) {}
          const nome = attesaInvitante.nome;
          resetTelepathy();
          setAvvisoInviti(testoInviti('non_arrivato', {
            nome
          }));
        }
      } finally {
        inCorso = false;
      }
    };
    giro();
    const intervallo = setInterval(giro, 2000);
    return () => {
      fermo = true;
      clearInterval(intervallo);
    };
  }, [attesaInvitante && attesaInvitante.invitoId, matchId, partner]);
  useEffect(() => {
    if (!invitoDaAprire || !nickname || !sessionId || !IH) return;
    const {
      invito,
      azione
    } = invitoDaAprire;
    setInvitoDaAprire(null);
    (async () => {
      setActiveTab('telepathy');
      if (!invito) {
        setAvvisoInviti(testoInviti('non_trovato'));
        return;
      }
      const r = await rpcInviti('get_telepathy_invite', {
        p_invite_id: invito
      });
      if (r && r.ok === false && (r.motivo === 'errore' || r.motivo === 'auth_fallita')) {
        setAvvisoInviti(testoInviti(r.motivo));
        return;
      }
      if (r && r.adesso) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
      const esito = IH.esitoApertura(r, azione);
      if (esito.tipo === 'conferma_blocco') {
        setConfermaBlocco({
          nome: esito.nome,
          p_invite_id: invito,
          daNotifica: true
        });
        return;
      }
      if (esito.tipo === 'rispondi') {
        setIncomingInvite({
          from_id: r.invito.from_id,
          from_name: r.invito.nome,
          invite_id: r.invito.id,
          expires_at: r.invito.expires_at
        });
        return;
      }
      if (esito.tipo === 'entra') {
        await entraNelMatchDaInvito(esito.matchId);
        return;
      }
      if (esito.tipo === 'attesa') {
        setInvitoInUscita(r.invito);
        setDirectInviteTarget({
          id: null,
          nickname: r.invito.nome
        });
        return;
      }
      setAvvisoInviti(testoInviti(esito.motivo, {
        nome: esito.nome
      }));
    })();
  }, [invitoDaAprire, nickname, sessionId]);
  const confermaBloccoInviti = async () => {
    const c = confermaBlocco;
    if (!c) return;
    setConfermaBlocco(null);
    setSchedaInvito(null);
    const {
      nome,
      daNotifica,
      ...chi
    } = c;
    const r = await rpcInviti('block_telepathy_inviter', {
      p_invite_id: null,
      p_disponibilita_id: null,
      p_session_online: null,
      ...chi
    });
    if (!r || !r.ok) {
      const motivo = r && r.motivo || 'errore';
      setAvvisoInviti(testoInviti(motivo === 'non_trovato' && !daNotifica ? 'non_trovato_scheda' : motivo));
      return;
    }
    setIncomingInvite(x => x && (x.invite_id === chi.p_invite_id || x.from_name === (r.nome || nome)) ? null : x);
    setAvvisoInviti(testoInviti('bloccato_ok', {
      nome: r.nome || nome
    }));
  };
  const [disponibileInviti, setDisponibileInviti] = useState(null);
  const [invitabili, setInvitabili] = useState([]);
  const [schedaInvito, setSchedaInvito] = useState(null);
  const ultimoRinnovoRef = React.useRef(0);
  useEffect(() => {
    setSchedaInvito(null);
    if (!nickname || !sessionId) {
      setDisponibileInviti(null);
      setInvitabili([]);
      return;
    }
    let fermo = false;
    const rinnova = async () => {
      ultimoRinnovoRef.current = Date.now();
      let r = await rpcInviti('renew_telepathy_availability', {});
      if (fermo || !r || !r.ok) return;
      if (r.stato === 'senza_abbonamento' && pushDisponibile() && Notification.permission === 'granted' && localStorage.getItem('ga_push_spento') !== '1') {
        try {
          await iscriviPush();
          r = await rpcInviti('renew_telepathy_availability', {});
        } catch (_) {}
      }
      if (fermo || !r || !r.ok) return;
      setDisponibileInviti(r.stato === 'acceso');
      if (r.stato === 'senza_abbonamento') setAvvisoInviti(testoInviti('nessun_abbonamento'));
    };
    rinnova();
    const alRitorno = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimoRinnovoRef.current >= 3600000) rinnova();
    };
    document.addEventListener('visibilitychange', alRitorno);
    return () => {
      fermo = true;
      document.removeEventListener('visibilitychange', alRitorno);
    };
  }, [nickname, sessionId]);
  const accendiDisponibilita = async () => {
    if (!pushDisponibile()) {
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      setDisponibileInviti(false);
      if (iOS && !installata) setMostraInstallaPerPush(true);else setAvvisoInviti(testoInviti('push_non_supportata'));
      return;
    }
    try {
      if (Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') {
          setDisponibileInviti(false);
          setAvvisoInviti(testoInviti('permesso_negato'));
          return;
        }
      }
      await iscriviPush();
    } catch (_) {
      setDisponibileInviti(false);
      setAvvisoInviti(testoInviti('errore'));
      return;
    }
    const r = await rpcInviti('set_telepathy_availability', {
      p_nickname: nickname || 'Anonymous',
      p_enabled: true
    });
    const ok = !!(r && r.ok && r.acceso);
    setDisponibileInviti(ok);
    if (!ok) setAvvisoInviti(testoInviti(r && r.motivo || 'errore'));
  };
  const spegniDisponibilita = async () => {
    const r = await rpcInviti('set_telepathy_availability', {
      p_nickname: nickname || 'Anonymous',
      p_enabled: false
    });
    if (r && r.ok) setDisponibileInviti(false);else setAvvisoInviti(testoInviti('errore'));
  };
  const spegniDisponibilitaDi = async (sid, hash) => {
    if (disponibileInviti === false || !sid) return;
    try {
      await supabase.rpc('set_telepathy_availability', {
        p_session_id: sid,
        p_password_hash: hash || null,
        p_nickname: null,
        p_enabled: false
      });
    } catch (_) {}
    setDisponibileInviti(false);
  };
  const renderInterruttoreInviti = dataTest => React.createElement("div", {
    style: {
      padding: '0.5rem 0'
    }
  }, React.createElement("div", {
    className: "flex items-center justify-between",
    style: {
      gap: '0.75rem'
    }
  }, React.createElement("span", {
    className: "text-white text-sm"
  }, testoInviti('interruttore')), React.createElement("button", {
    "data-test": dataTest,
    role: "switch",
    "aria-checked": disponibileInviti === true,
    "aria-label": testoInviti('interruttore'),
    onClick: () => disponibileInviti ? spegniDisponibilita() : accendiDisponibilita(),
    style: {
      width: '3rem',
      height: '1.5rem',
      flexShrink: 0,
      borderRadius: '9999px',
      position: 'relative',
      cursor: 'pointer',
      transition: 'all 0.3s',
      background: disponibileInviti ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.2)',
      border: disponibileInviti ? '1px solid rgba(34,197,94,0.7)' : '1px solid rgba(255,255,255,0.3)'
    }
  }, React.createElement("div", {
    style: {
      width: '1.1rem',
      height: '1.1rem',
      borderRadius: '50%',
      background: '#fff',
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      left: disponibileInviti ? 'calc(100% - 1.3rem)' : '0.15rem',
      transition: 'all 0.3s'
    }
  }))), React.createElement("p", {
    className: "text-secondary text-xs",
    style: {
      marginTop: '0.25rem'
    }
  }, testoInviti('nota_nome')));
  useEffect(() => {
    if (activeTab !== 'telepathy' || partner || !nickname || !sessionId) return;
    let fermo = false;
    const giro = async () => {
      const r = await rpcInviti('get_invitable_users', {
        p_nickname: nickname || 'Anonymous'
      });
      if (!fermo && Array.isArray(r)) setInvitabili(r);
    };
    giro();
    const intervallo = setInterval(giro, 15000);
    return () => {
      fermo = true;
      clearInterval(intervallo);
    };
  }, [activeTab, partner, nickname, sessionId]);
  const apriScheda = async chi => {
    const r = await rpcInviti('get_invite_card', {
      p_nickname: nickname || 'Anonymous',
      p_disponibilita_id: chi.disponibilita_id || null,
      p_session_online: chi.disponibilita_id ? null : chi.id
    });
    if (!r || !r.ok) {
      setAvvisoInviti(testoInviti(r && r.motivo === 'non_trovato' ? 'non_disponibile' : r && r.motivo || 'errore'));
      return;
    }
    setSchedaInvito({
      chi,
      dati: r.scheda
    });
  };
  const onlineInLobby = onlineUsersForTelepathy.filter(u => {
    const visto = Date.parse(u.last_seen);
    const recente = !isNaN(visto) && Date.now() - visto < 30000;
    return recente || !invitabili.some(d => d.nickname === u.nickname);
  });
  const playAgainSamePartner = async () => {
    const savedPartner = partner;
    if (!savedPartner) return;
    const {
      data: presence
    } = await supabase.from('online_users').select('id,last_seen').eq('id', savedPartner.id);
    const stillOnline = presence && presence.length > 0 && Date.now() - new Date(presence[0].last_seen).getTime() < 30000;
    if (!stillOnline) {
      alert(`${savedPartner.nickname} ${t.telepathy.partnerOffline}`);
      return;
    }
    if (matchId) {
      try {
        await supabase.rpc('end_telepathy_match', {
          p_match_id: matchId,
          p_ended_by: sessionId
        });
      } catch (_) {}
    }
    resetTelepathy();
    await sendDirectInvite({
      id: savedPartner.id,
      nickname: savedPartner.nickname
    });
  };
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const {
          data
        } = await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('session_id', sessionId);
        if (data && data.length > 0) {
          const p = data[0];
          const loaded = {
            bio: p.bio || '',
            starseedType: p.starseed_type || '',
            avatar: p.avatar || '',
            country: p.country || '',
            interests: p.interests || [],
            experienceLevel: p.experience_level || ''
          };
          setProfile(loaded);
          localStorage.setItem('ga_profile', JSON.stringify(loaded));
          return;
        }
      } catch (err) {
        console.warn('Failed to load profile from Supabase:', err);
      }
      const local = localStorage.getItem('ga_profile');
      if (local) {
        try {
          setProfile(JSON.parse(local));
        } catch (e) {}
      }
    };
    loadProfile();
  }, [sessionId]);
  const saveProfile = async () => {
    localStorage.setItem('ga_profile', JSON.stringify(profile));
    if (isGuest) {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
      return;
    }
    const roundsInt = Math.max(0, Math.floor(Number(totalRounds) || 0));
    const matchesInt = Math.max(0, Math.floor(Number(totalMatches) || 0));
    const {
      data: esito,
      error
    } = await supabase.rpc('update_my_profile', {
      p_nickname: nickname,
      p_password_hash: passwordHash,
      p_fields: {
        bio: profile.bio || '',
        starseed_type: profile.starseedType || '',
        avatar: profile.avatar || '',
        country: profile.country || '',
        interests: profile.interests || [],
        experience_level: profile.experienceLevel || '',
        telepathy_score: roundsInt,
        telepathy_best: matchesInt,
        show_telepathy_score: showTelepathyScore !== false
      }
    });
    if (error || !esito || !esito.ok) {
      alert(t.profileSaveFailed);
      return;
    }
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };
  const sendTelepathyMessage = async () => {
    if (!newTelepathyMessage.trim() || !matchId) return;
    const msg = newTelepathyMessage.trim();
    setNewTelepathyMessage('');
    await supabase.from('telepathy_chat').insert({
      match_id: matchId,
      sender_name: nickname || 'Anonymous',
      content: msg
    });
  };
  const getPartnerStatus = () => {
    if (!partner) return '';
    if (showLevelBanner) return t.telepathy.statusChoosingLevel;
    if (showResult) return t.telepathy.statusRoundDone;
    if (effectiveRole === 'sender') {
      if (waitingForPartner) return `${partner.nickname} ${t.telepathy.statusGuessing}`;
      return `${partner.nickname} ${t.telepathy.statusWaitingSymbol}`;
    } else {
      if (waitingForPartner) return t.telepathy.statusWaitingResult;
      if (senderHasSent) return `${partner.nickname} ${t.telepathy.statusSent}`;
      return `${partner.nickname} ${t.telepathy.statusChoosing}`;
    }
  };
  const isMyTurn = () => {
    if (!partner || showResult || sessionEnded || waitingForPartner || showLevelBanner) return false;
    if (effectiveRole === 'sender') return true;
    if (effectiveRole === 'receiver') return senderHasSent;
    return false;
  };
  const endSession = async () => {
    if (sessionEnded) return;
    setSessionEnded(true);
    setShowResult(false);
    setWaitingForPartner(false);
    try {
      const userId = userEmail || sessionId;
      const {
        error: rpcErr
      } = await supabase.rpc('increment_telepathy_score', {
        p_user_id: userId,
        p_nickname: nickname || 'Anonymous',
        p_rounds: roundCount,
        p_matches: sessionMatches
      });
      if (rpcErr) console.warn('increment_telepathy_score failed', rpcErr);
      const {
        data: updated
      } = await supabase.rpc('get_my_telepathy_totals', {
        p_user_id: userId,
        p_password_hash: passwordHash
      });
      const newRounds = updated && updated[0] ? updated[0].rounds_count || 0 : totalRounds + roundCount;
      const newMatches = updated && updated[0] ? updated[0].matches_count || 0 : totalMatches + sessionMatches;
      setTotalRounds(newRounds);
      setTotalMatches(newMatches);
      localStorage.setItem('telepathy_score', String(newRounds));
      localStorage.setItem('telepathy_best', String(newMatches));
      if (!isGuest && nickname && passwordHash) {
        await supabase.rpc('update_my_profile', {
          p_nickname: nickname,
          p_password_hash: passwordHash,
          p_fields: {
            telepathy_score: newRounds,
            telepathy_best: newMatches
          }
        });
      }
      if (matchId) {
        let flagSet = false;
        try {
          const {
            error: endErr
          } = await supabase.rpc('end_telepathy_match', {
            p_match_id: matchId,
            p_ended_by: sessionId
          });
          flagSet = !endErr;
        } catch (e) {}
        await supabase.from('telepathy_chat').delete().eq('match_id', matchId);
        if (flagSet) {
          setTimeout(() => {
            supabase.from('telepathy_matches').delete().eq('id', matchId);
          }, 6000);
        } else {
          await supabase.from('telepathy_matches').delete().eq('id', matchId);
        }
      }
    } catch (err) {
      console.warn('endSession error:', err);
    } finally {
      setMatchId(null);
    }
  };
  const toggleInterest = key => {
    setProfile(prev => ({
      ...prev,
      interests: prev.interests.includes(key) ? prev.interests.filter(i => i !== key) : [...prev.interests, key]
    }));
  };
  const openProfile = async userName => {
    try {
      markAsRead(userName);
      const {
        data
      } = await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('nickname', userName);
      if (data && data.length > 0) {
        const p = data[0];
        let rounds = 0,
          matches = 0;
        try {
          const {
            data: st
          } = await supabase.rpc('get_public_telepathy_stats', {
            p_nickname: userName
          });
          if (st && st.length > 0) {
            rounds = st[0].rounds_count || 0;
            matches = st[0].matches_count || 0;
          }
        } catch (e) {}
        setViewingProfile({
          nickname: p.nickname || userName || 'Anonymous',
          bio: p.bio || '',
          starseedType: p.starseed_type || '',
          avatar: p.avatar || '',
          country: p.country || '',
          interests: p.interests || [],
          experienceLevel: p.experience_level || '',
          telepathyRounds: rounds || p.telepathy_score || 0,
          telepathyMatches: matches || p.telepathy_best || 0,
          showTelepathyScore: p.show_telepathy_score !== false,
          registered: true
        });
      } else {
        setViewingProfile({
          nickname: userName || 'Anonymous',
          bio: '',
          starseedType: '',
          avatar: '',
          country: '',
          interests: [],
          experienceLevel: '',
          telepathyRounds: 0,
          telepathyMatches: 0,
          empty: true,
          registered: false
        });
      }
    } catch (err) {
      console.warn('Failed to load profile:', err);
    }
  };
  useEffect(() => {
    if (!nickname || isGuest || !passwordHash) {
      setPrivateMessages([]);
      setUnreadCount(0);
      return;
    }
    const loadMessages = async () => {
      const {
        data,
        error
      } = await supabase.rpc('get_my_messages', {
        p_nickname: nickname,
        p_password_hash: passwordHash
      });
      if (error || !Array.isArray(data)) return;
      const all = [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setPrivateMessages(all);
      setUnreadCount(all.filter(m => m.receiver_name === nickname && !m.is_read).length);
    };
    loadMessages();
    const interval = setInterval(loadMessages, 8000);
    return () => clearInterval(interval);
  }, [nickname, isGuest, passwordHash]);
  useEffect(() => {
    if (!nickname) return;
    const loadNotifications = async () => {
      const {
        data
      } = await supabase.from('notifications').select('*').eq('user_nickname', nickname).eq('read', false).order('created_at', {
        ascending: false
      });
      if (data) setNotifItems(data);
    };
    loadNotifications();
    const interval = setInterval(loadNotifications, 10000);
    return () => clearInterval(interval);
  }, [nickname]);
  const markOneNotifRead = async (notif, tabTarget) => {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${notif.id}`, {
      method: 'PATCH',
      headers: SB_HEADERS,
      body: JSON.stringify({
        read: true
      })
    });
    setNotifItems(prev => prev.filter(n => n.id !== notif.id));
    setShowNotifPanel(false);
    if (notif.type === 'telepathy_invite') {
      const r = await aggiornaInviti();
      if (!r || !r.in_arrivo) return;
    }
    if (notif.type === 'private_message') {
      try {
        if (!isGuest && passwordHash) {
          const {
            data
          } = await supabase.rpc('get_my_messages', {
            p_nickname: nickname,
            p_password_hash: passwordHash
          });
          if (Array.isArray(data)) {
            const all = [...data];
            all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            setPrivateMessages(all);
          }
        }
      } catch (err) {
        console.warn('reload private_messages failed', err);
      }
      const senderMatch = notif.message.match(/^(.+) ti ha inviato/);
      if (senderMatch) openProfile(senderMatch[1]);
    } else {
      setActiveTab(tabTarget);
    }
  };
  const getConversationMessages = otherUser => {
    return privateMessages.filter(m => m.sender_name === nickname && m.receiver_name === otherUser || m.sender_name === otherUser && m.receiver_name === nickname).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  };
  const showErrorToast = msg => setErrorToast(msg || t.connectionError);
  const sendPrivateMessage = async (receiverName, text) => {
    if (!text.trim() || !receiverName) return false;
    const {
      data,
      error
    } = await supabase.rpc('send_private_message', {
      p_sender_id: sessionId,
      p_sender_name: nickname || 'Anonymous',
      p_receiver_name: receiverName,
      p_content: text.trim(),
      p_sender_password_hash: passwordHash
    });
    if (error) return false;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.id) {
      setPrivateMessages(prev => [...prev, row]);
    }
    return true;
  };
  const submitPrivateMessage = async () => {
    const txt = newPrivateMessage;
    if (!txt.trim() || !viewingProfile || savingContent) return;
    if (!viewingProfile.registered) {
      showErrorToast();
      return;
    }
    setNewPrivateMessage('');
    setSavingContent(true);
    const ok = await sendPrivateMessage(viewingProfile.nickname, txt);
    setSavingContent(false);
    if (ok) {
      markAsRead(viewingProfile.nickname);
    } else {
      setNewPrivateMessage(txt);
      showErrorToast();
    }
  };
  const markAsRead = async otherUser => {
    const unreadMsgs = privateMessages.filter(m => m.sender_name === otherUser && m.receiver_name === nickname && !m.is_read);
    for (const msg of unreadMsgs) {
      await supabase.rpc('mark_message_read', {
        p_message_id: msg.id,
        p_receiver_name: nickname
      });
    }
  };
  const createRitual = async () => {
    if (!newRitual.name || !newRitual.date || !newRitual.time) {
      alert('Please fill in name, date and time.');
      return;
    }
    const istanteLocale = new Date(`${newRitual.date}T${newRitual.time}`);
    if (isNaN(istanteLocale.getTime())) {
      alert('Please fill in name, date and time.');
      return;
    }
    const dataUtc = istanteLocale.toISOString().slice(0, 10);
    const oraUtc = istanteLocale.toISOString().slice(11, 16);
    const ricorre = newRitual.ripeti !== 'mai';
    const giorni = newRitual.ripeti === 'ogni' ? [1, 2, 3, 4, 5, 6, 7] : newRitual.giorni;
    if (ricorre && (!newRitual.fino || giorni.length === 0)) {
      setErrorToast(t.rituals.recurrenceErrors.recurrence_incomplete);
      return;
    }
    const ritualData = {
      creator: nickname || 'Anonymous',
      creator_id: sessionId,
      name: newRitual.name,
      description: newRitual.description,
      type: newRitual.type,
      sacred_number: newRitual.sacredNumber,
      date: dataUtc,
      time: oraUtc,
      duration: newRitual.duration,
      participants: [sessionId],
      energy: 0
    };
    setSavingContent(true);
    try {
      const {
        data,
        error
      } = await supabase.rpc('create_ritual', {
        p_creator: ritualData.creator,
        p_creator_id: ritualData.creator_id,
        p_name: ritualData.name,
        p_description: ritualData.description,
        p_type: ritualData.type,
        p_sacred_number: ritualData.sacred_number,
        p_date: ritualData.date,
        p_time: ritualData.time,
        p_duration: ritualData.duration,
        p_password_hash: passwordHash,
        ...(ricorre ? {
          p_ripeti_giorni: giorni,
          p_ripeti_fino: newRitual.fino,
          p_fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        } : {})
      });
      if (error) {
        console.warn('Supabase RPC create_ritual error:', error);
        setSavingContent(false);
        const codice = Object.keys(t.rituals.recurrenceErrors).find(k => (error.message || '').includes(k));
        if (codice) setErrorToast(t.rituals.recurrenceErrors[codice]);else showErrorToast();
        return;
      }
      if (Array.isArray(data) && data[0]) await rileggiRituale(data[0].id);
    } catch (err) {
      console.warn('Create ritual failed:', err);
      setSavingContent(false);
      showErrorToast();
      return;
    }
    setSavingContent(false);
    setShowCreateRitual(false);
    setNewRitual({
      name: '',
      description: '',
      type: 'consciousness',
      sacredNumber: 11,
      date: '',
      time: '',
      duration: DURATA_RITUALE_PREDEFINITA,
      ripeti: 'mai',
      giorni: [],
      fino: ''
    });
  };
  const createTestRitual = async () => {
    const now = new Date();
    const utcDate = now.toISOString().slice(0, 10);
    const utcTime = now.toISOString().slice(11, 16);
    await supabase.rpc('create_ritual', {
      p_creator: nickname || 'Anonymous',
      p_creator_id: sessionId,
      p_name: '⚡ Test Ritual',
      p_description: 'Rituale di test — scade in 3 minuti',
      p_type: 'consciousness',
      p_sacred_number: 11,
      p_date: utcDate,
      p_time: utcTime,
      p_duration: 3,
      p_password_hash: passwordHash
    });
  };
  const pushDisponibile = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const b64UrlToUint8 = b64 => {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(s);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  };
  const salvaConfigPush = async () => {
    try {
      const c = await caches.open('ga-push-config');
      await c.put('config', new Response(JSON.stringify({
        url: SUPABASE_URL,
        key: SUPABASE_KEY,
        sessionId,
        locale: lang === 'it' ? 'it' : 'en',
        vapid: VAPID_PUBLIC_KEY
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      }));
    } catch (_) {}
  };
  const iscriviPush = async () => {
    const reg = await navigator.serviceWorker.ready;
    const esistente = await reg.pushManager.getSubscription();
    const sub = esistente || (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64UrlToUint8(VAPID_PUBLIC_KEY)
    }));
    const j = sub.toJSON();
    const {
      error
    } = await supabase.rpc('register_push_subscription', {
      p_session_id: sessionId,
      p_endpoint: sub.endpoint,
      p_p256dh: j.keys.p256dh,
      p_auth: j.keys.auth,
      p_locale: lang === 'it' ? 'it' : 'en'
    });
    if (error) throw new Error('registrazione push non riuscita');
    await salvaConfigPush();
    localStorage.removeItem('ga_push_spento');
    localStorage.removeItem('ga_push_rifiutato_il');
    setPushAttive(true);
  };
  const spegniPushAlLogout = () => {
    setPushAttive(false);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await supabase.rpc('delete_push_subscription', {
            p_endpoint: sub.endpoint
          });
          await sub.unsubscribe();
        }
      } catch (_) {}
      try {
        await caches.delete('ga-push-config');
      } catch (_) {}
    })();
  };
  React.useEffect(() => {
    if (!pushAttive || !sessionId) return;
    iscriviPush().catch(() => salvaConfigPush());
  }, [sessionId, lang, pushAttive]);
  const spegniPush = async () => {
    localStorage.setItem('ga_push_spento', '1');
    setPushAttive(false);
    if (disponibileInviti !== false) spegniDisponibilita();
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.rpc('delete_push_subscription', {
          p_endpoint: sub.endpoint
        });
        await sub.unsubscribe();
      }
    } catch (_) {}
  };
  const valutaPush = async () => {
    if (!pushDisponibile()) {
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      if (iOS && !installata) setMostraInstallaPerPush(true);
      return;
    }
    if (localStorage.getItem('ga_push_spento') === '1') return;
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'granted') {
      try {
        await iscriviPush();
      } catch (_) {}
      return;
    }
    const rifiutatoIl = localStorage.getItem('ga_push_rifiutato_il');
    if (rifiutatoIl && Date.now() - Date.parse(rifiutatoIl) < 7 * 24 * 60 * 60 * 1000) return;
    setChiediPush(true);
  };
  const rispondiPush = async si => {
    setChiediPush(false);
    if (!pushDisponibile()) {
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      if (iOS && !installata) setMostraInstallaPerPush(true);
      return;
    }
    if (!si) {
      localStorage.setItem('ga_push_rifiutato_il', new Date().toISOString());
      return;
    }
    const esito = await Notification.requestPermission();
    if (esito !== 'granted') return;
    try {
      await iscriviPush();
    } catch (_) {}
  };
  const joiningRef = useRef(new Set());
  const joinRitual = async ritualId => {
    const ritual = rituals.find(r => r.id === ritualId);
    if (!ritual || ritual.participants.includes(sessionId)) return;
    if (joiningRef.current.has(ritualId)) return;
    joiningRef.current.add(ritualId);
    const {
      error
    } = await supabase.rpc('join_ritual', {
      p_ritual_id: ritualId,
      p_session_id: sessionId
    });
    joiningRef.current.delete(ritualId);
    if (error) {
      showErrorToast();
      return;
    }
    setRituals(prev => prev.map(r => r.id === ritualId && !r.participants.includes(sessionId) ? {
      ...r,
      participants: [...r.participants, sessionId]
    } : r));
    if (ritual.creator && ritual.creator !== nickname) {
      await supabase.from('notifications').insert({
        user_nickname: ritual.creator,
        type: 'ritual_join',
        message: `${nickname} si è unito/a al tuo rituale "${ritual.name}"`
      });
    }
    await valutaPush();
  };
  const rileggiRituale = async id => {
    const {
      data,
      error
    } = await supabase.from('rituali_correnti').select('*').eq('id', id);
    if (error) return;
    setRituals(prev => {
      const riga = Array.isArray(data) && data[0];
      if (!riga) return prev.filter(r => r.id !== id);
      return prev.some(r => r.id === id) ? prev.map(r => r.id === id ? riga : r) : [riga, ...prev];
    });
  };
  const messaggioErroreRituale = (error, generico) => (error && error.message || '').includes('Auth failed') ? t.rituals.reloginNeeded : generico;
  const leaveRitual = async ritualId => {
    const {
      error
    } = await supabase.rpc('leave_ritual', {
      p_ritual_id: ritualId,
      p_session_id: sessionId,
      p_password_hash: passwordHash || ''
    });
    if (error) {
      setErrorToast(messaggioErroreRituale(error, t.rituals.leaveFailed));
      return;
    }
    await rileggiRituale(ritualId);
  };
  const sendEnergy = async ritualId => {
    const ritual = rituals.find(r => r.id === ritualId);
    if (!ritual) return;
    await supabase.rpc('send_ritual_energy', {
      p_ritual_id: ritualId,
      p_amount: 10
    });
  };
  const toggleCandle = async ritualId => {
    const presenza = await supabase.rpc('segna_presenza_rituale', {
      p_ritual_id: ritualId,
      p_session_id: sessionId
    });
    const {
      data,
      error
    } = await supabase.rpc('toggle_ritual_candle', {
      p_ritual_id: ritualId,
      p_session_id: sessionId,
      p_nickname: nickname,
      p_password_hash: passwordHash || ''
    });
    const motivo = error && error.message || '';
    if (motivo.includes('not_live')) {
      showErrorToast(t.rituals.candleNotLive);
      return;
    }
    if (motivo.includes('Auth failed')) {
      showErrorToast(t.rituals.reloginNeeded);
      return;
    }
    if (motivo.includes('too_many_candles')) {
      showErrorToast(t.rituals.candleTooMany);
      return;
    }
    if (motivo.includes('not_present')) {
      const motivoPresenza = presenza && presenza.error && presenza.error.message || '';
      if (motivoPresenza.includes('not_live')) showErrorToast(t.rituals.candleNotLive);else if (presenza && presenza.error) showErrorToast();else showErrorToast(t.rituals.candleNotPresent);
      return;
    }
    if (error || !data || data.length === 0) {
      showErrorToast();
      return;
    }
    await rileggiRituale(ritualId);
  };
  const [ritualToDelete, setRitualToDelete] = useState(null);
  const doDeleteRitual = async ritualId => {
    const {
      error
    } = await supabase.rpc('delete_ritual', {
      p_ritual_id: ritualId,
      p_session_id: sessionId,
      p_password_hash: passwordHash || ''
    });
    if (error) {
      const msg = error.message || '';
      setErrorToast(msg.includes('already_started') ? t.rituals.deleteStarted : t.rituals.deleteFailed);
      return;
    }
    setRituals(prev => prev.filter(r => r.id !== ritualId));
  };
  const [ritualToStop, setRitualToStop] = useState(null);
  const doFermaRituale = async ritualId => {
    const {
      error
    } = await supabase.rpc('ferma_rituale', {
      p_ritual_id: ritualId,
      p_session_id: sessionId,
      p_password_hash: passwordHash || ''
    });
    if (error) {
      setErrorToast(messaggioErroreRituale(error, t.rituals.stopFailed));
      return;
    }
    await rileggiRituale(ritualId);
  };
  const getRitualStatus = ritual => {
    const now = new Date();
    const ritualTime = new Date(`${ritual.date}T${ritual.time}Z`);
    const endTime = new Date(ritualTime.getTime() + ritual.duration * 60000);
    if (now >= ritualTime && now <= endTime) return 'live';
    if (now > endTime) return 'ended';
    const diff = ritualTime - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor(diff % 3600000 / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  React.useEffect(() => {
    if (showNicknamePrompt || ritualeDaAprire == null || rituals.length === 0) return;
    const r = rituals.find(x => x.id === ritualeDaAprire);
    if (r && getRitualStatus(r) === 'live') setStanzaId(r.id);
    setRitualeDaAprire(null);
  }, [ritualeDaAprire, rituals, showNicknamePrompt]);
  const candelaMiaStanza = !!stanza && (stanza.candles || []).includes(sessionId);
  const nomiCandeleStanza = stanza ? (stanza.candles || []).map(sid => (stanza.candles_nomi || {})[sid]).filter(n => n && !isBlocked(n)) : [];
  const stanzaLive = !!stanza && getRitualStatus(stanza) === 'live';
  React.useEffect(() => {
    setPresentiStanza(null);
    if (stanzaId == null) return;
    if (!stanzaLive) {
      setStanzaId(null);
      return;
    }
    let vivo = true;
    const segna = async () => {
      const {
        data,
        error
      } = await supabase.rpc('segna_presenza_rituale', {
        p_ritual_id: stanzaId,
        p_session_id: sessionId
      });
      if (vivo && !error && typeof data === 'number') setPresentiStanza(data);
    };
    segna();
    const timer = setInterval(segna, 30000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [stanzaId, stanzaLive, sessionId]);
  const formatRitualWhen = ritual => {
    const istante = new Date(`${ritual.date}T${ritual.time}Z`);
    if (isNaN(istante.getTime())) return `${ritual.date} ${ritual.time}`;
    return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    }).format(istante);
  };
  const descriviRipetizione = ritual => {
    const g = ritual.ripeti_giorni || [];
    const quando = g.length === 7 ? t.rituals.everyDay : g.map(n => t.rituals.weekdaysShort[n - 1]).join(', ');
    const istante = new Date(`${ritual.date}T${ritual.time}Z`);
    const ora = isNaN(istante.getTime()) ? '' : new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(istante);
    return `${quando} ${t.rituals.atTime} ${ora}`;
  };
  const MUSIC_SRC = 'assets/meditation-music-rockot.mp3';
  const MUSIC_VOLUME = 0.35;
  const musicRef = React.useRef(null);
  const [musicMuted, setMusicMuted] = useState(() => {
    try {
      return localStorage.getItem('ga_music_muted') === '1';
    } catch {
      return false;
    }
  });
  const toggleMusic = () => {
    setMusicMuted(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ga_music_muted', next ? '1' : '0');
      } catch {}
      return next;
    });
  };
  const ritualeLive = rituals.find(r => (r.id === stanzaId || Array.isArray(r.participants) && r.participants.includes(sessionId)) && getRitualStatus(r) === 'live');
  const inLiveRitual = !!ritualeLive;
  const inTelepathySession = !!partner && !sessionEnded;
  const musicOn = (inLiveRitual || inTelepathySession) && !musicMuted;
  const [musicaInAttesaDiGesto, setMusicaInAttesaDiGesto] = useState(false);
  const sbloccoMusicaRef = React.useRef(0);
  const [sogliaAperta, setSogliaAperta] = useState(false);
  const tocchiSogliaRef = React.useRef(0);
  React.useEffect(() => {
    if (!inLiveRitual) {
      setSogliaAperta(false);
      return;
    }
    if (musicaInAttesaDiGesto) {
      tocchiSogliaRef.current = 0;
      setSogliaAperta(true);
      return;
    }
    const timer = setTimeout(() => setSogliaAperta(false), 800);
    return () => clearTimeout(timer);
  }, [musicaInAttesaDiGesto, inLiveRitual]);
  React.useEffect(() => {
    const el = musicRef.current;
    if (!el) return;
    if (typeof MusicHelpers === 'undefined') return;
    if (musicOn) {
      return MusicHelpers.avviaMusica(el, {
        volume: MUSIC_VOLUME,
        onGesto: () => {
          sbloccoMusicaRef.current = Date.now();
        },
        onStato: stato => setMusicaInAttesaDiGesto(stato === 'in-attesa-di-gesto')
      });
    }
    setMusicaInAttesaDiGesto(false);
    if (!el.paused) return MusicHelpers.fermaMusica(el);
  }, [musicOn]);
  const toggleRitualComments = async ritualId => {
    if (expandedRitualId === ritualId) {
      setExpandedRitualId(null);
      return;
    }
    setExpandedRitualId(ritualId);
    if (!ritualCommentsMap[ritualId]) {
      const {
        data
      } = await supabase.from('ritual_comments').select('*').eq('ritual_id', ritualId).order('created_at', {
        ascending: true
      });
      if (data) setRitualCommentsMap(prev => ({
        ...prev,
        [ritualId]: data.filter(x => !isBlocked(x.author_nickname))
      }));
    }
  };
  const createRitualComment = async ritualId => {
    const content = (newRitualCommentContents[ritualId] || '').trim();
    if (!content) return;
    const {
      data,
      error
    } = await supabase.rpc('create_ritual_comment', {
      p_ritual_id: ritualId,
      p_author_nickname: nickname,
      p_content: content,
      p_password_hash: passwordHash
    });
    if (error || !data || data.length === 0) {
      showErrorToast();
      return;
    }
    setRitualCommentsMap(prev => ({
      ...prev,
      [ritualId]: [...(prev[ritualId] || []), ...data]
    }));
    setNewRitualCommentContents(prev => ({
      ...prev,
      [ritualId]: ''
    }));
    const ritual = rituals.find(r => r.id === ritualId);
    if (ritual && ritual.creator && ritual.creator !== nickname) {
      await supabase.from('notifications').insert({
        user_nickname: ritual.creator,
        type: 'ritual_comment',
        message: `${nickname} ha commentato il tuo rituale "${ritual.name}"`
      });
    }
  };
  const createPost = async () => {
    if (!newPostContent.trim()) return;
    const content = newPostContent.trim();
    const optimistic = {
      id: `local-${Date.now()}`,
      author_nickname: nickname,
      content,
      created_at: new Date().toISOString()
    };
    setPosts(prev => [optimistic, ...prev]);
    setNewPostContent('');
    setSavingContent(true);
    const {
      error
    } = await supabase.from('consciousness_posts').insert({
      author_nickname: nickname,
      content
    });
    setSavingContent(false);
    if (error) {
      setPosts(prev => prev.filter(p => p.id !== optimistic.id));
      setNewPostContent(content);
      showErrorToast();
    }
  };
  const togglePostComments = async postId => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(postId);
    const {
      data
    } = await supabase.from('consciousness_comments').select('*').eq('post_id', postId).order('created_at', {
      ascending: true
    });
    if (data) setCommentsMap(prev => ({
      ...prev,
      [postId]: data.filter(x => !isBlocked(x.author_nickname))
    }));
  };
  const createComment = async postId => {
    const content = (newCommentContents[postId] || '').trim();
    if (!content) return;
    const optimistic = {
      id: `local-${Date.now()}`,
      post_id: postId,
      author_nickname: nickname,
      content,
      created_at: new Date().toISOString()
    };
    setCommentsMap(prev => ({
      ...prev,
      [postId]: [...(prev[postId] || []), optimistic]
    }));
    setNewCommentContents(prev => ({
      ...prev,
      [postId]: ''
    }));
    const {
      error
    } = await supabase.from('consciousness_comments').insert({
      post_id: postId,
      author_nickname: nickname,
      content
    });
    if (error) {
      setCommentsMap(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== optimistic.id)
      }));
      setNewCommentContents(prev => ({
        ...prev,
        [postId]: content
      }));
      showErrorToast();
      return;
    }
    const post = posts.find(p => p.id === postId);
    if (post && post.author_nickname !== nickname) {
      await supabase.from('notifications').insert({
        user_nickname: post.author_nickname,
        type: 'comment',
        message: `${nickname} ha commentato il tuo post`
      });
    }
  };
  const renderFooter = () => React.createElement("footer", {
    className: "app-footer text-secondary"
  }, React.createElement("span", null, "Global Awakening \xB7 ", new Date().getFullYear()), React.createElement("span", {
    style: {
      margin: '0 0.4rem'
    }
  }, "\xB7"), React.createElement("button", {
    onClick: () => setShowPrivacy(true)
  }, t.privacy.linkLabel), React.createElement("span", {
    style: {
      margin: '0 0.4rem'
    }
  }, "\xB7"), React.createElement("a", {
    href: "https://github.com/global-awakening/global-awakening.github.io/issues",
    target: "_blank",
    rel: "noopener noreferrer",
    style: {
      color: '#a78bfa',
      textDecoration: 'underline',
      cursor: 'pointer',
      minHeight: '40px',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, t.reportIssue), React.createElement("span", {
    style: {
      margin: '0 0.4rem'
    }
  }, "\xB7"), React.createElement("span", null, t.musicCredit, ' ', React.createElement("a", {
    href: "https://pixabay.com/users/rockot-1947599/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=184575",
    target: "_blank",
    rel: "noopener noreferrer",
    style: {
      color: '#a78bfa',
      textDecoration: 'underline'
    }
  }, "Rockot"), ' ', t.musicFrom, ' ', React.createElement("a", {
    href: "https://pixabay.com/music/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=184575",
    target: "_blank",
    rel: "noopener noreferrer",
    style: {
      color: '#a78bfa',
      textDecoration: 'underline'
    }
  }, "Pixabay")), !isStandalone && (deferredPrompt || isIos) && React.createElement(React.Fragment, null, React.createElement("span", {
    style: {
      margin: '0 0.4rem'
    }
  }, "\xB7"), React.createElement("button", {
    onClick: handleInstall,
    style: {
      background: 'none',
      border: 'none',
      color: '#a78bfa',
      textDecoration: 'underline',
      cursor: 'pointer',
      fontSize: 'inherit',
      padding: 0,
      minHeight: '40px'
    }
  }, t.pwaInstall)));
  const renderIosInstallModal = () => showIosInstall && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setShowIosInstall(false),
    style: {
      zIndex: 70
    }
  }, React.createElement("div", {
    className: "modal-content",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: '22rem'
    }
  }, React.createElement("h3", {
    className: "text-xl font-bold text-white mb-2"
  }, isInAppBrowser ? t.pwaIosBrowserTitle : t.pwaIosTitle), React.createElement("p", {
    className: "text-secondary text-sm mb-4"
  }, isInAppBrowser ? t.pwaIosBrowserBody : t.pwaIosBody), React.createElement("button", {
    className: "btn-primary w-full",
    onClick: () => setShowIosInstall(false)
  }, t.pwaIosClose)));
  const renderInstallBanner = (variant = '') => !isStandalone && (deferredPrompt || isIos) && !installBannerDismissed && React.createElement("div", {
    className: 'install-banner ' + variant
  }, React.createElement("button", {
    className: "install-banner-close",
    "aria-label": t.pwaBannerClose,
    onClick: dismissInstallBanner
  }, "\u2715"), React.createElement("span", {
    className: "install-banner-text"
  }, t.pwaBannerText), React.createElement("button", {
    className: "btn-primary install-banner-cta",
    onClick: handleInstall
  }, t.pwaInstall));
  const renderPrivacyModal = () => showPrivacy && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setShowPrivacy(false)
  }, React.createElement("div", {
    className: "modal-content",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: '560px',
      maxHeight: '80vh',
      overflowY: 'auto'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '0.5rem'
    }
  }, React.createElement("h2", {
    className: "text-white font-bold",
    style: {
      fontSize: '1.3rem'
    }
  }, t.privacy.title), React.createElement("button", {
    onClick: () => setShowPrivacy(false),
    "aria-label": t.privacy.close,
    className: "btn-secondary",
    style: {
      minWidth: '40px',
      minHeight: '40px',
      padding: '0.25rem 0.6rem'
    }
  }, "\u2715")), React.createElement("p", {
    className: "text-secondary",
    style: {
      fontSize: '0.8rem',
      marginBottom: '1rem'
    }
  }, t.privacy.lastUpdated), React.createElement("p", {
    className: "text-secondary",
    style: {
      fontSize: '0.9rem',
      marginBottom: '1rem'
    }
  }, t.privacy.intro), t.privacy.sections.map((s, i) => React.createElement("div", {
    key: i,
    style: {
      marginBottom: '1rem'
    }
  }, React.createElement("h3", {
    className: "text-white font-bold mb-2",
    style: {
      fontSize: '1rem'
    }
  }, s.heading), React.createElement("p", {
    className: "text-secondary",
    style: {
      fontSize: '0.9rem',
      lineHeight: '1.5'
    }
  }, s.body)))));
  if (showNicknamePrompt) {
    return React.createElement("div", {
      className: "min-h-screen bg-gradient flex flex-col items-center justify-center p-4",
      style: {
        paddingBottom: '3.5rem'
      }
    }, renderInstallBanner('install-banner--landing'), React.createElement("div", {
      className: "absolute top-4 right-4"
    }, React.createElement("button", {
      onClick: () => setLang(lang === 'en' ? 'it' : 'en'),
      className: "btn-secondary"
    }, lang === 'en' ? '🌐 EN' : '🌐 IT')), React.createElement("div", {
      className: "bg-glass rounded-3xl p-8 max-w-md w-full shadow-2xl border-glass"
    }, React.createElement("div", {
      className: "text-center mb-8"
    }, React.createElement("div", {
      style: {
        fontSize: '4rem'
      },
      className: "mb-4 pulse-glow"
    }, "\u2B50"), React.createElement("h1", {
      className: "text-4xl font-bold text-white mb-2"
    }, t.title), React.createElement("p", {
      className: "text-secondary text-sm"
    }, t.subtitle)), !resetToken && React.createElement("div", {
      style: {
        display: 'flex',
        gap: '0',
        marginBottom: '1.5rem',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.2)'
      }
    }, ['login', 'register', 'guest'].map((tab, i, arr) => React.createElement("button", {
      key: tab,
      onClick: () => {
        setAuthTab(tab);
        setLoginError('');
        setLoginSuccess('');
      },
      style: {
        flex: 1,
        padding: '0.75rem 0.5rem',
        background: authTab === tab ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255,255,255,0.05)',
        color: '#fff',
        border: 'none',
        cursor: 'pointer',
        fontWeight: authTab === tab ? 700 : 500,
        fontSize: '0.95rem',
        transition: 'all 0.2s',
        borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none'
      }
    }, tab === 'guest' ? t.tabGuest : tab === 'login' ? t.tabLogin : t.tabRegister))), React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }
    }, authTab === 'guest' && !resetToken && React.createElement(React.Fragment, null, React.createElement("input", {
      type: "text",
      value: tempNickname,
      onChange: e => {
        setTempNickname(e.target.value);
        setLoginError('');
      },
      placeholder: t.usernamePlaceholder,
      "aria-label": t.usernamePlaceholder,
      maxLength: 30
    }), React.createElement("button", {
      onClick: handleEnterGuest,
      className: "btn-primary",
      style: {
        width: '100%',
        fontSize: '1.125rem'
      }
    }, t.enterAsGuest)), authTab === 'login' && !showResetForm && !resetToken && React.createElement(React.Fragment, null, React.createElement("input", {
      type: "email",
      value: tempEmail,
      onChange: e => {
        setTempEmail(e.target.value);
        setLoginError('');
      },
      placeholder: t.emailPlaceholder,
      "aria-label": t.emailPlaceholder
    }), React.createElement("input", {
      type: "password",
      value: tempPassword,
      onChange: e => {
        setTempPassword(e.target.value);
        setLoginError('');
      },
      placeholder: "Password",
      "aria-label": "Password"
    }), React.createElement("button", {
      onClick: handleLogin,
      className: "btn-primary",
      style: {
        width: '100%',
        fontSize: '1.125rem'
      },
      disabled: !tempEmail.trim() || !tempPassword.trim() || authLoading
    }, authLoading ? '…' : t.login), React.createElement("p", {
      onClick: () => {
        setShowResetForm(true);
        setLoginError('');
        setLoginSuccess('');
      },
      style: {
        color: '#a78bfa',
        textAlign: 'center',
        cursor: 'pointer',
        fontSize: '0.875rem'
      }
    }, t.forgotPassword), React.createElement("p", {
      onClick: () => {
        setAuthTab('register');
        setLoginError('');
        setLoginSuccess('');
      },
      style: {
        color: '#a78bfa',
        textAlign: 'center',
        cursor: 'pointer',
        fontSize: '0.875rem'
      }
    }, t.noAccountYet), React.createElement("p", {
      onClick: () => {
        setShowMagicLink(m => !m);
        setLoginError('');
        setLoginSuccess('');
      },
      style: {
        color: '#c4b5fd',
        textAlign: 'center',
        cursor: 'pointer',
        fontSize: '0.85rem',
        opacity: 0.8
      }
    }, t.magicLinkHint), showMagicLink && React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '0.75rem',
        background: 'rgba(139,92,246,0.1)',
        borderRadius: '0.75rem',
        border: '1px solid rgba(139,92,246,0.3)'
      }
    }, React.createElement("input", {
      type: "email",
      value: magicLinkEmail,
      onChange: e => {
        setMagicLinkEmail(e.target.value);
        setLoginError('');
      },
      placeholder: t.emailPlaceholder,
      "aria-label": t.emailPlaceholder
    }), React.createElement("button", {
      onClick: handleSendMagicLink,
      className: "btn-primary",
      style: {
        width: '100%'
      },
      disabled: !magicLinkEmail.trim() || authLoading
    }, authLoading ? '…' : t.sendMagicLink))), authTab === 'login' && showResetForm && !resetToken && React.createElement(React.Fragment, null, React.createElement("p", {
      className: "text-white font-bold text-center",
      style: {
        fontSize: '1.05rem'
      }
    }, t.resetPassword), React.createElement("input", {
      type: "email",
      value: resetEmail,
      onChange: e => {
        setResetEmail(e.target.value);
        setLoginError('');
      },
      placeholder: t.emailPlaceholder,
      "aria-label": t.emailPlaceholder
    }), React.createElement("button", {
      onClick: handleSendResetEmail,
      className: "btn-primary",
      style: {
        width: '100%',
        fontSize: '1.125rem'
      },
      disabled: !resetEmail.trim() || authLoading
    }, authLoading ? '…' : t.resetPassword), React.createElement("p", {
      onClick: () => {
        setShowResetForm(false);
        setLoginError('');
        setLoginSuccess('');
      },
      style: {
        color: '#a78bfa',
        textAlign: 'center',
        cursor: 'pointer',
        fontSize: '0.875rem'
      }
    }, t.backToLogin)), resetToken && React.createElement(React.Fragment, null, React.createElement("p", {
      className: "text-white font-bold text-center",
      style: {
        fontSize: '1.05rem'
      }
    }, t.setNewPassword), React.createElement("input", {
      type: "password",
      value: resetNewPassword,
      onChange: e => {
        setResetNewPassword(e.target.value);
        setLoginError('');
      },
      placeholder: t.newPasswordPlaceholder,
      "aria-label": t.newPasswordPlaceholder
    }), React.createElement("input", {
      type: "password",
      value: resetConfirmPassword,
      onChange: e => {
        setResetConfirmPassword(e.target.value);
        setLoginError('');
      },
      placeholder: t.confirmPasswordPlaceholder,
      "aria-label": t.confirmPasswordPlaceholder
    }), React.createElement("button", {
      onClick: handleSetNewPassword,
      className: "btn-primary",
      style: {
        width: '100%',
        fontSize: '1.125rem'
      },
      disabled: !resetNewPassword.trim() || !resetConfirmPassword.trim() || authLoading
    }, authLoading ? '…' : t.setNewPassword)), authTab === 'register' && !resetToken && React.createElement(React.Fragment, null, React.createElement("input", {
      type: "text",
      value: tempNickname,
      onChange: e => {
        setTempNickname(e.target.value);
        setLoginError('');
      },
      placeholder: t.usernamePlaceholder,
      "aria-label": t.usernamePlaceholder,
      maxLength: 30
    }), React.createElement("input", {
      type: "email",
      value: tempEmail,
      onChange: e => {
        setTempEmail(e.target.value);
        setLoginError('');
      },
      placeholder: t.emailPlaceholder,
      "aria-label": t.emailPlaceholder
    }), React.createElement("input", {
      type: "password",
      value: tempPassword,
      onChange: e => {
        setTempPassword(e.target.value);
        setLoginError('');
      },
      placeholder: "Password",
      "aria-label": "Password"
    }), React.createElement("button", {
      onClick: handleRegister,
      className: "btn-primary",
      style: {
        width: '100%',
        fontSize: '1.125rem'
      },
      disabled: !tempNickname.trim() || !tempEmail.trim() || !tempPassword.trim() || authLoading
    }, authLoading ? '…' : t.register), React.createElement("p", {
      onClick: () => {
        setAuthTab('login');
        setLoginError('');
        setLoginSuccess('');
      },
      style: {
        color: '#a78bfa',
        textAlign: 'center',
        cursor: 'pointer',
        fontSize: '0.875rem'
      }
    }, t.alreadyHaveAccount)), loginError && React.createElement("div", {
      className: "result-try-again rounded-xl p-3 text-center"
    }, React.createElement("p", {
      style: {
        color: '#fb923c'
      },
      className: "font-bold"
    }, loginError)), loginSuccess && React.createElement("div", {
      className: "result-success rounded-xl p-3 text-center"
    }, React.createElement("p", {
      style: {
        color: '#4ade80'
      },
      className: "font-bold"
    }, loginSuccess)))), renderFooter(), renderPrivacyModal(), renderIosInstallModal());
  }
  return React.createElement("div", {
    className: "min-h-screen bg-gradient app-shell",
    style: {
      paddingBottom: '3.5rem'
    }
  }, React.createElement("header", {
    className: "sticky top-0 bg-glass border-b z-50"
  }, React.createElement("div", {
    className: "container"
  }, React.createElement("div", {
    className: "header-inner flex items-center justify-between py-3"
  }, React.createElement("div", {
    className: "header-left flex items-center gap-3"
  }, React.createElement(Star, {
    style: {
      width: '2rem',
      height: '2rem',
      color: '#fbbf24'
    }
  }), React.createElement("div", null, React.createElement("h1", {
    className: "text-xl font-bold text-white"
  }, t.title), React.createElement("p", {
    className: "text-primary text-xs"
  }, t.subtitle))), React.createElement("div", {
    className: "header-right flex items-center gap-3"
  }, React.createElement("button", {
    onClick: () => setLang(lang === 'en' ? 'it' : 'en'),
    className: "btn-secondary px-3 py-2"
  }, lang === 'en' ? '🌐 EN' : '🌐 IT'), React.createElement("div", {
    className: "flex items-center gap-2"
  }, React.createElement("div", {
    className: "text-white font-medium",
    style: {
      cursor: 'pointer'
    },
    onClick: () => setShowEditProfile(true),
    title: t.editProfile
  }, profile.avatar && React.createElement("span", {
    style: {
      marginRight: '0.25rem'
    }
  }, profile.avatar), nickname), React.createElement("span", {
    style: {
      fontSize: '0.65rem',
      padding: '0.15rem 0.5rem',
      borderRadius: '9999px',
      background: isGuest ? 'rgba(251,191,36,0.3)' : 'rgba(34,197,94,0.3)',
      color: isGuest ? '#fbbf24' : '#4ade80',
      border: isGuest ? '1px solid rgba(251,191,36,0.5)' : '1px solid rgba(34,197,94,0.5)'
    }
  }, isGuest ? t.guestBadge : t.registeredBadge)), unreadCount > 0 && React.createElement("span", {
    style: {
      background: '#ef4444',
      color: '#fff',
      borderRadius: '9999px',
      padding: '0.15rem 0.5rem',
      fontSize: '0.7rem',
      fontWeight: 700,
      cursor: 'default'
    },
    title: t.messages.title
  }, unreadCount, " \uD83D\uDCAC"), React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, (inLiveRitual || inTelepathySession) && React.createElement("button", {
    onClick: () => {
      if (Date.now() - sbloccoMusicaRef.current < 1000) return;
      toggleMusic();
    },
    className: "btn-secondary px-3 py-2",
    style: {
      fontSize: '0.8rem'
    },
    title: musicaInAttesaDiGesto ? t.musicTap : undefined,
    "aria-label": musicaInAttesaDiGesto ? t.musicTap : musicMuted ? t.musicUnmute : t.musicMute
  }, musicMuted ? '🔇' : musicaInAttesaDiGesto ? '🔈' : '🔊'), React.createElement("button", {
    onClick: () => setShowNotifPanel(p => !p),
    className: "btn-secondary px-3 py-2",
    style: {
      fontSize: '0.8rem',
      position: 'relative'
    },
    "aria-label": t.social.notifications
  }, "\uD83D\uDD14", notifItems.length > 0 && React.createElement("span", {
    style: {
      position: 'absolute',
      top: '-4px',
      right: '-4px',
      background: '#ef4444',
      color: '#fff',
      borderRadius: '9999px',
      fontSize: '0.6rem',
      fontWeight: 700,
      minWidth: '16px',
      height: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 3px'
    }
  }, notifItems.length)), showNotifPanel && React.createElement("div", {
    style: {
      position: 'absolute',
      right: 0,
      top: '2.5rem',
      width: '300px',
      background: '#1a1d2e',
      border: '1px solid rgba(124,58,237,0.35)',
      borderRadius: '0.75rem',
      padding: '0.75rem',
      zIndex: 200,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
    }
  }, notifItems.length === 0 ? React.createElement("p", {
    style: {
      color: '#a78bfa',
      fontSize: '0.85rem',
      textAlign: 'center',
      padding: '0.5rem'
    }
  }, "Nessuna notifica") : React.createElement(React.Fragment, null, notifItems.map(n => {
    const tabTarget = n.type === 'telepathy_invite' ? 'telepathy' : n.type === 'comment' ? 'consciousness' : n.type === 'private_message' ? null : 'rituals';
    const icon = n.type === 'comment' || n.type === 'ritual_comment' ? '💬' : n.type === 'ritual_join' ? '🌟' : n.type === 'private_message' ? '✉️' : n.type === 'telepathy_declined' ? '❌' : '🧠';
    const isExpiredInvite = n.type === 'telepathy_invite' && !incomingInvite;
    return React.createElement("div", {
      key: n.id,
      "data-test": "notifica",
      onClick: isExpiredInvite ? () => markOneNotifRead(n, tabTarget) : undefined,
      style: {
        padding: '0.5rem 0.25rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        opacity: isExpiredInvite ? 0.6 : 1,
        cursor: isExpiredInvite ? 'pointer' : 'default'
      }
    }, React.createElement("span", {
      style: {
        fontSize: '1rem'
      }
    }, icon), React.createElement("span", {
      style: {
        flex: 1,
        color: '#e5e7eb',
        fontSize: '0.82rem'
      }
    }, n.message, isExpiredInvite && React.createElement("span", {
      style: {
        marginLeft: '0.4rem',
        background: 'rgba(239,68,68,0.2)',
        color: '#fca5a5',
        fontSize: '0.62rem',
        fontWeight: 700,
        padding: '0.1rem 0.4rem',
        borderRadius: '0.4rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap'
      }
    }, t.telepathy.inviteExpired)), React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        markOneNotifRead(n, tabTarget);
      },
      className: "btn-primary",
      style: {
        fontSize: '0.75rem',
        padding: '0.2rem 0.6rem',
        whiteSpace: 'nowrap'
      }
    }, isExpiredInvite ? 'OK' : 'Vai'));
  })))), React.createElement("button", {
    onClick: () => setShowLogoutConfirm(true),
    className: "btn-secondary px-3 py-2",
    style: {
      fontSize: '0.8rem'
    }
  }, t.logout))))), React.createElement("div", {
    className: "container",
    style: {
      paddingTop: '1rem'
    }
  }, renderInstallBanner()), React.createElement("div", {
    className: "container py-3"
  }, React.createElement("div", {
    className: "bg-glass rounded-2xl p-4 border-glass",
    style: {
      background: 'rgba(124, 58, 237, 0.12)',
      border: '1px solid rgba(124, 58, 237, 0.2)'
    }
  }, React.createElement("div", {
    className: "grid grid-cols-3 gap-4 text-center stats-grid"
  }, React.createElement("div", null, React.createElement("div", {
    className: "text-2xl font-bold text-white"
  }, rituals.length), React.createElement("div", {
    className: "text-secondary text-xs"
  }, t.stats.activeRituals)), React.createElement("div", null, React.createElement("div", {
    className: "text-2xl font-bold",
    style: {
      color: '#fbbf24'
    }
  }, totalRounds), React.createElement("div", {
    className: "text-secondary text-xs"
  }, t.stats.roundsPlayed)), React.createElement("div", {
    onClick: () => {
      setActiveTab('consciousness');
      setTimeout(() => {
        document.getElementById('community-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100);
    },
    style: {
      cursor: 'pointer'
    },
    title: "Vedi gli utenti online (Community)"
  }, React.createElement("div", {
    className: "text-2xl font-bold",
    style: {
      color: '#4ade80',
      textDecoration: 'underline',
      textDecorationColor: 'rgba(74,222,128,0.4)',
      textUnderlineOffset: '0.2rem'
    }
  }, onlineUsers.length), React.createElement("div", {
    className: "text-secondary text-xs"
  }, t.stats.onlineNow))))), React.createElement("div", {
    className: "container main-nav-top",
    style: {
      paddingTop: '0.5rem'
    }
  }, React.createElement("div", {
    className: "flex gap-2 bg-glass rounded-2xl p-3",
    style: {
      overflowX: 'auto'
    }
  }, ['rituals', 'telepathy', 'consciousness'].map(tab => React.createElement("button", {
    key: tab,
    onClick: () => setActiveTab(tab),
    className: `py-2 px-3 rounded-xl font-medium transition-all ${activeTab === tab ? 'tab-active' : 'tab-inactive'}`,
    style: {
      whiteSpace: 'nowrap',
      flex: '1',
      textAlign: 'center',
      fontSize: 'clamp(0.75rem, 2.5vw, 1rem)',
      minHeight: '44px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.35rem'
    }
  }, t.tabs[tab], tab === 'telepathy' && partner && !sessionEnded && !partnerDisconnected && React.createElement("span", {
    className: "training-badge pulse-glow",
    style: {
      display: 'inline-block',
      width: '8px',
      height: '8px',
      background: '#a78bfa',
      borderRadius: '50%',
      marginLeft: '0.4rem',
      boxShadow: '0 0 8px #a78bfa',
      verticalAlign: 'middle'
    },
    "aria-hidden": "true"
  }))))), React.createElement("nav", {
    className: "main-nav-bottom",
    "aria-label": "Sezioni principali"
  }, ['rituals', 'telepathy', 'consciousness'].map(tab => React.createElement("button", {
    key: tab,
    onClick: () => setActiveTab(tab),
    className: `nav-item ${activeTab === tab ? 'on' : ''}`,
    "aria-current": activeTab === tab ? 'page' : undefined
  }, React.createElement("span", {
    className: "nav-ic",
    "aria-hidden": "true"
  }, {
    rituals: '🕯️',
    telepathy: '🔮',
    consciousness: '🌌'
  }[tab]), React.createElement("span", {
    className: "nav-lb"
  }, t.tabs[tab]), tab === 'telepathy' && partner && !sessionEnded && !partnerDisconnected && React.createElement("span", {
    className: "training-badge pulse-glow",
    style: {
      position: 'absolute',
      top: '7px',
      right: 'calc(50% - 22px)',
      width: '8px',
      height: '8px',
      background: '#a78bfa',
      borderRadius: '50%',
      boxShadow: '0 0 8px #a78bfa'
    },
    "aria-hidden": "true"
  })))), React.createElement("div", {
    className: "container py-6"
  }, activeTab === 'rituals' && React.createElement("div", null, React.createElement("div", {
    className: "flex items-center justify-between mb-6"
  }, React.createElement("div", null, React.createElement("h2", {
    className: "text-3xl font-bold text-white mb-2"
  }, t.rituals.title), React.createElement("p", {
    className: "text-primary"
  }, t.rituals.subtitle)), React.createElement("div", {
    className: "flex gap-2"
  }, React.createElement("button", {
    onClick: createTestRitual,
    className: "btn-secondary",
    style: {
      fontSize: '0.8rem'
    }
  }, "\u26A1 Test (3 min)"), React.createElement("button", {
    onClick: () => setShowCreateRitual(true),
    className: "btn-primary"
  }, t.rituals.createRitual))), rituals.length === 0 && React.createElement("div", {
    className: "bg-glass rounded-2xl text-center border-glass",
    style: {
      maxWidth: '380px',
      margin: '2rem auto',
      padding: '2.5rem 2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem'
    }
  }, React.createElement("div", {
    style: {
      fontSize: '3.5rem',
      lineHeight: 1
    }
  }, "\uD83C\uDF1F"), React.createElement("p", {
    className: "text-white",
    style: {
      margin: 0
    }
  }, t.rituals.noRituals)), chiediPush && React.createElement("div", {
    "data-test": "push-chiedi",
    className: "bg-glass rounded-2xl border-glass",
    style: {
      padding: '1rem 1.25rem',
      marginBottom: '1rem'
    }
  }, React.createElement("p", {
    className: "text-white text-sm",
    style: {
      marginTop: 0,
      marginBottom: '0.75rem'
    }
  }, t.pushChiedi), React.createElement("div", {
    className: "flex gap-2"
  }, React.createElement("button", {
    "data-test": "push-si",
    onClick: () => rispondiPush(true),
    className: "btn-primary"
  }, t.pushSi), React.createElement("button", {
    "data-test": "push-no",
    onClick: () => rispondiPush(false),
    className: "btn-secondary"
  }, t.pushNo))), mostraInstallaPerPush && React.createElement("div", {
    "data-test": "push-installa-ios",
    className: "bg-glass rounded-2xl border-glass",
    style: {
      padding: '1rem 1.25rem',
      marginBottom: '1rem'
    }
  }, React.createElement("p", {
    className: "text-white text-sm",
    style: {
      margin: 0
    }
  }, t.pushIosInstalla), React.createElement("button", {
    onClick: () => setMostraInstallaPerPush(false),
    className: "btn-secondary",
    style: {
      marginTop: '0.75rem'
    }
  }, "OK")), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '1rem'
    }
  }, rituals.map(ritual => {
    const status = getRitualStatus(ritual);
    const isLive = status === 'live';
    const isJoined = ritual.participants.includes(sessionId);
    const candleCount = (ritual.candles || []).length;
    const isCandleLit = (ritual.candles || []).includes(sessionId);
    const ricorrente = Array.isArray(ritual.ripeti_giorni);
    const primoIstante = ricorrente ? new Date(`${ritual.prima_date}T${ritual.prima_time}Z`) : null;
    const serieNonPartita = ricorrente && primoIstante > new Date();
    const serieIniziata = ricorrente && !serieNonPartita;
    const ritualComments = ritualCommentsMap[ritual.id] || [];
    const isRitualExpanded = expandedRitualId === ritual.id;
    return React.createElement("div", {
      key: ritual.id,
      className: `ritual-card ${isLive ? 'ritual-live' : ''}`
    }, React.createElement("div", {
      className: "flex items-start justify-between mb-3"
    }, React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: '2rem'
      },
      className: "mb-2"
    }, ritualTypes.find(t => t.id === ritual.type)?.icon), React.createElement("h3", {
      className: "text-xl font-bold text-white mb-1"
    }, ritual.name), Array.isArray(ritual.ripeti_giorni) && React.createElement("p", {
      "data-test": "ritual-recurrence",
      className: "text-sm",
      style: {
        color: '#c4b5fd'
      }
    }, "\uD83D\uDD01 ", descriviRipetizione(ritual), " \xB7 ", t.rituals.dayOf(ritual.occorrenza_numero, ritual.occorrenze_totali)), React.createElement("p", {
      className: "text-secondary text-sm",
      "data-test": "ritual-desc",
      style: {
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        whiteSpace: 'pre-line'
      }
    }, ritual.description), ritual.creator && React.createElement("span", {
      className: "text-xs",
      style: {
        color: '#a78bfa',
        cursor: 'pointer',
        textDecoration: 'underline dotted'
      },
      onClick: () => openProfile(ritual.creator)
    }, "\u2726 ", ritual.creator)), React.createElement("div", {
      className: "flex items-start gap-1"
    }, React.createElement("div", {
      className: "text-2xl",
      style: {
        color: '#fbbf24'
      }
    }, ritual.sacred_number), moderationMenu({
      author: ritual.creator,
      type: 'ritual',
      id: ritual.id,
      snapshot: `${ritual.name}
${ritual.description || ''}`
    }))), React.createElement("div", {
      className: "flex items-center gap-2 mb-3"
    }, React.createElement(Calendar, {
      style: {
        width: '1rem',
        height: '1rem',
        color: '#a78bfa'
      }
    }), React.createElement("span", {
      className: "text-primary text-sm"
    }, formatRitualWhen(ritual))), React.createElement("div", {
      className: "flex items-center justify-between mb-4"
    }, React.createElement("div", {
      className: "flex items-center gap-2"
    }, React.createElement(Users, {
      style: {
        width: '1rem',
        height: '1rem',
        color: '#a78bfa'
      }
    }), React.createElement("span", {
      className: "text-white text-sm"
    }, ritual.participants.length, " ", t.rituals.participants)), React.createElement("span", {
      className: "text-sm",
      style: {
        color: isLive ? '#4ade80' : '#fbbf24'
      }
    }, isLive ? t.rituals.live : status === 'ended' ? t.rituals.ended : `${t.rituals.startsIn} ${status}`)), React.createElement("div", {
      className: "flex gap-2 mb-3",
      style: {
        flexWrap: 'wrap'
      }
    }, React.createElement("button", {
      "data-test": "join-ritual",
      onClick: () => joinRitual(ritual.id),
      className: isJoined ? 'btn-secondary flex-1' : 'btn-primary flex-1',
      disabled: isJoined || status === 'ended'
    }, isJoined ? t.rituals.joined : t.rituals.join), isLive && React.createElement("button", {
      "data-test": "open-room",
      onClick: () => setStanzaId(ritual.id),
      className: "btn-primary px-4"
    }, t.rituals.enterRoom, " \uD83D\uDD6F\uFE0F"), isLive && React.createElement("button", {
      onClick: () => sendEnergy(ritual.id),
      className: "btn-secondary px-4"
    }, "\u26A1 ", ritual.energy), React.createElement("span", {
      "data-test": "card-candles",
      className: "px-4",
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        borderRadius: '0.75rem',
        border: isCandleLit ? '1px solid rgba(251,191,36,0.7)' : '1px solid rgba(255,255,255,0.2)',
        background: isCandleLit ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.06)',
        color: '#fff'
      }
    }, React.createElement("span", {
      style: {
        filter: isCandleLit ? 'none' : 'grayscale(1) opacity(0.6)'
      }
    }, "\uD83D\uDD6F\uFE0F"), " ", candleCount), ritual.creator_id === sessionId && (ricorrente ? serieNonPartita : status !== 'live' && status !== 'ended') && React.createElement("button", {
      "data-test": "delete-ritual",
      onClick: () => setRitualToDelete(ritual),
      className: "px-4",
      "aria-label": t.rituals.deleteRitual,
      title: t.rituals.deleteRitual,
      style: {
        borderRadius: '0.75rem',
        border: '1px solid rgba(248,113,113,0.5)',
        background: 'rgba(248,113,113,0.12)',
        color: '#fca5a5',
        cursor: 'pointer'
      }
    }, "\uD83D\uDDD1\uFE0F"), isJoined && ritual.creator_id !== sessionId && React.createElement("button", {
      "data-test": "leave-ritual",
      className: "btn-secondary px-4",
      onClick: () => leaveRitual(ritual.id)
    }, t.rituals.leave), ritual.creator_id === sessionId && serieIniziata && !ritual.fermato_il && React.createElement("button", {
      "data-test": "stop-ritual",
      onClick: () => setRitualToStop(ritual),
      className: "btn-secondary px-4"
    }, t.rituals.stop)), React.createElement("div", {
      className: "flex gap-2"
    }, React.createElement("button", {
      onClick: () => toggleRitualComments(ritual.id),
      className: "btn-secondary",
      style: {
        fontSize: '0.8rem',
        padding: '0.45rem 0.85rem',
        minHeight: '40px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, isRitualExpanded ? t.feed.hideComments : t.feed.showComments, ritualComments.length > 0 ? ` (${ritualComments.length})` : ''), React.createElement("button", {
      onClick: () => toggleRitualComments(ritual.id),
      className: "btn-primary",
      style: {
        fontSize: '0.8rem',
        padding: '0.45rem 0.85rem',
        minHeight: '40px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, t.feed.comment)), isRitualExpanded && React.createElement("div", {
      style: {
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.08)'
      }
    }, ritualComments.map(c => {
      const commentKind = 'ritual_comment';
      return React.createElement("div", {
        key: c.id,
        style: {
          marginBottom: '0.75rem',
          paddingLeft: '1rem',
          borderLeft: '2px solid rgba(124,58,237,0.4)'
        }
      }, React.createElement("div", {
        className: "flex items-center gap-2 mb-1"
      }, React.createElement("span", {
        className: "text-primary font-medium text-xs",
        style: {
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(167,139,250,0.4)'
        },
        onClick: () => openProfile(c.author_nickname)
      }, c.author_nickname), React.createElement("span", {
        style: {
          color: '#c4b5fd'
        },
        className: "text-xs"
      }, new Date(c.created_at).toLocaleTimeString()), moderationMenu({
        author: c.author_nickname,
        type: commentKind,
        id: c.id,
        snapshot: c.content
      })), React.createElement("p", {
        className: "text-white",
        style: {
          fontSize: '0.9rem'
        }
      }, c.content));
    }), React.createElement("div", {
      className: "flex gap-2",
      style: {
        marginTop: '0.75rem'
      }
    }, React.createElement("input", {
      type: "text",
      value: newRitualCommentContents[ritual.id] || '',
      onChange: e => setNewRitualCommentContents(prev => ({
        ...prev,
        [ritual.id]: e.target.value
      })),
      onKeyPress: e => e.key === 'Enter' && createRitualComment(ritual.id),
      placeholder: t.feed.addComment,
      style: {
        flex: 1,
        fontSize: '0.875rem'
      }
    }), React.createElement("button", {
      onClick: () => createRitualComment(ritual.id),
      className: "btn-primary px-4 py-2",
      style: {
        fontSize: '0.85rem'
      }
    }, t.feed.comment))));
  }))), activeTab === 'consciousness' && React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }
  }, React.createElement("div", null, React.createElement("div", {
    className: "mb-4"
  }, React.createElement("h2", {
    className: "text-3xl font-bold text-white mb-2"
  }, t.feed.title), React.createElement("p", {
    className: "text-primary"
  }, t.feed.subtitle)), React.createElement("div", {
    className: "bg-glass rounded-2xl border-glass p-4 mb-4"
  }, React.createElement("textarea", {
    value: newPostContent,
    onChange: e => setNewPostContent(e.target.value),
    placeholder: t.feed.newPostPlaceholder,
    "aria-label": t.feed.newPostPlaceholder,
    rows: 3,
    style: {
      width: '100%',
      resize: 'vertical',
      marginBottom: '0.75rem',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '0.75rem',
      color: '#fff',
      padding: '0.75rem',
      fontSize: '0.95rem'
    },
    onKeyDown: e => {
      if (e.key === 'Enter' && e.ctrlKey) createPost();
    }
  }), React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, React.createElement("button", {
    onClick: createPost,
    className: "btn-primary",
    disabled: !newPostContent.trim() || savingContent
  }, savingContent ? '…' : t.feed.post))), posts.length === 0 && React.createElement("div", {
    className: "bg-glass rounded-2xl p-10 text-center border-glass"
  }, React.createElement("div", {
    style: {
      fontSize: '3rem'
    },
    className: "mb-3"
  }, "\uD83D\uDCAD"), React.createElement("p", {
    className: "text-white"
  }, t.feed.noFeed)), posts.map(post => {
    const postComments = commentsMap[post.id] || [];
    const isExpanded = expandedPostId === post.id;
    return React.createElement("div", {
      key: post.id,
      className: "bg-glass rounded-2xl border-glass p-4 mb-3"
    }, React.createElement("div", {
      className: "flex items-center gap-2 mb-2"
    }, React.createElement("span", {
      className: "text-primary font-medium text-sm",
      style: {
        cursor: 'pointer',
        textDecoration: 'underline',
        textDecorationColor: 'rgba(167,139,250,0.4)'
      },
      onClick: () => openProfile(post.author_nickname)
    }, post.author_nickname), React.createElement("span", {
      style: {
        color: '#c4b5fd'
      },
      className: "text-xs"
    }, new Date(post.created_at).toLocaleString()), moderationMenu({
      author: post.author_nickname,
      type: 'post',
      id: post.id,
      snapshot: post.content
    })), React.createElement("p", {
      className: "text-white",
      style: {
        marginBottom: '0.75rem',
        lineHeight: '1.5'
      }
    }, post.content), React.createElement("div", {
      className: "flex gap-2"
    }, React.createElement("button", {
      onClick: () => togglePostComments(post.id),
      className: "btn-secondary",
      style: {
        fontSize: '0.8rem',
        padding: '0.45rem 0.85rem',
        minHeight: '40px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, isExpanded ? t.feed.hideComments : t.feed.showComments, postComments.length > 0 ? ` (${postComments.length})` : ''), React.createElement("button", {
      onClick: () => togglePostComments(post.id),
      className: "btn-primary",
      style: {
        fontSize: '0.8rem',
        padding: '0.45rem 0.85rem',
        minHeight: '40px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, t.feed.comment)), isExpanded && React.createElement("div", {
      style: {
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.08)'
      }
    }, postComments.map(c => {
      const commentKind = 'post_comment';
      return React.createElement("div", {
        key: c.id,
        style: {
          marginBottom: '0.75rem',
          paddingLeft: '1rem',
          borderLeft: '2px solid rgba(124,58,237,0.4)'
        }
      }, React.createElement("div", {
        className: "flex items-center gap-2 mb-1"
      }, React.createElement("span", {
        className: "text-primary font-medium text-xs",
        style: {
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(167,139,250,0.4)'
        },
        onClick: () => openProfile(c.author_nickname)
      }, c.author_nickname), React.createElement("span", {
        style: {
          color: '#c4b5fd'
        },
        className: "text-xs"
      }, new Date(c.created_at).toLocaleTimeString()), moderationMenu({
        author: c.author_nickname,
        type: commentKind,
        id: c.id,
        snapshot: c.content
      })), React.createElement("p", {
        className: "text-white",
        style: {
          fontSize: '0.9rem'
        }
      }, c.content));
    }), React.createElement("div", {
      className: "flex gap-2",
      style: {
        marginTop: '0.75rem'
      }
    }, React.createElement("input", {
      type: "text",
      value: newCommentContents[post.id] || '',
      onChange: e => setNewCommentContents(prev => ({
        ...prev,
        [post.id]: e.target.value
      })),
      onKeyPress: e => e.key === 'Enter' && createComment(post.id),
      placeholder: t.feed.addComment,
      "aria-label": t.feed.addComment,
      style: {
        flex: 1,
        fontSize: '0.875rem'
      }
    }), React.createElement("button", {
      onClick: () => createComment(post.id),
      className: "btn-primary px-4 py-2",
      style: {
        fontSize: '0.85rem'
      }
    }, t.feed.comment))));
  })), React.createElement("div", null, React.createElement("div", {
    className: "mb-4"
  }, React.createElement("h2", {
    className: "text-3xl font-bold text-white mb-2"
  }, t.map.title), React.createElement("p", {
    className: "text-primary"
  }, t.map.subtitle)), React.createElement("div", {
    className: "map-container"
  }, React.createElement("img", {
    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 500'%3E%3Crect fill='%23111827' width='1000' height='500'/%3E%3Cpath fill='%231f2937' d='M0 250 Q 250 200 500 250 T 1000 250 L 1000 500 L 0 500 Z'/%3E%3C/svg%3E",
    alt: "World map",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }), onlineUsers.map(user => {
    const x = (user.lng + 180) / 360 * 100;
    const y = (90 - user.lat) / 180 * 100;
    return React.createElement(React.Fragment, {
      key: user.id
    }, React.createElement("div", {
      className: "map-point",
      style: {
        left: `${x}%`,
        top: `${y}%`
      },
      title: `${user.avatar || ''} ${user.nickname}`,
      onClick: () => openProfile(user.nickname)
    }), React.createElement("div", {
      className: "map-ripple ripple",
      style: {
        left: `${x}%`,
        top: `${y}%`
      }
    }));
  })), React.createElement("div", {
    className: "mt-4 text-center"
  }, React.createElement("span", {
    className: "text-white text-lg font-bold"
  }, onlineUsers.length), React.createElement("span", {
    className: "text-primary ml-2"
  }, t.map.visible)), React.createElement("div", {
    id: "community-section",
    className: "mt-6"
  }, React.createElement("h3", {
    className: "text-xl font-bold text-white mb-3"
  }, t.social.community), React.createElement("div", {
    className: "bg-glass rounded-2xl border-glass p-4",
    style: {
      maxHeight: '300px',
      overflowY: 'auto'
    }
  }, onlineUsers.map(user => React.createElement("div", {
    key: user.id,
    className: "flex items-center gap-3 p-3 rounded-xl transition-all",
    style: {
      cursor: 'pointer',
      background: 'rgba(255,255,255,0.05)',
      marginBottom: '0.5rem'
    },
    onClick: () => openProfile(user.nickname),
    onMouseOver: e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)',
    onMouseOut: e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
  }, React.createElement("span", {
    style: {
      fontSize: '1.5rem'
    }
  }, user.avatar || '👤'), React.createElement("span", {
    className: "text-white font-medium"
  }, user.nickname), React.createElement("div", {
    className: "online-dot",
    style: {
      marginLeft: 'auto'
    }
  }))))))), activeTab === 'telepathy' && React.createElement("div", {
    className: "bg-glass rounded-2xl p-6 border-glass"
  }, React.createElement("div", {
    className: `text-center mb-6 ${partner || sessionEnded ? 'tele-header-insession' : ''}`
  }, React.createElement(Brain, {
    style: partner || sessionEnded ? {
      width: '2.25rem',
      height: '2.25rem',
      margin: '0 auto 0.3rem',
      color: '#a78bfa'
    } : {
      width: '4rem',
      height: '4rem',
      margin: '0 auto 1rem',
      color: '#a78bfa'
    }
  }), React.createElement("h2", {
    className: "text-3xl font-bold text-white mb-2"
  }, t.telepathy.title), React.createElement("p", {
    className: "text-primary"
  }, t.telepathy.subtitle)), !partner && !searchingPartner && !sessionEnded && React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }
  }, React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4"
  }, React.createElement("h3", {
    className: "text-white font-bold mb-2"
  }, t.telepathy.howItWorks), React.createElement("p", {
    className: "text-primary text-sm"
  }, t.telepathy.step1), React.createElement("p", {
    className: "text-primary text-sm"
  }, t.telepathy.step2), React.createElement("p", {
    className: "text-primary text-sm"
  }, t.telepathy.step3)), React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4"
  }, renderInterruttoreInviti('interruttore-inviti')), invitoInUscita && React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.5rem'
    }
  }, React.createElement("span", {
    "data-test": "conto-invito",
    className: "text-white text-sm"
  }, t.telepathy.inviteSent, " ", testoInviti('invito_a', {
    nome: invitoInUscita.nome,
    tempo: (() => {
      const s = IH ? IH.secondiRimasti(invitoInUscita.expires_at, scartoOrologio, adessoLocale) : 0;
      return s > 0 ? testoInviti('scade_fra', {
        tempo: IH.mmss(s)
      }) : testoInviti('scaduto_breve');
    })()
  })), React.createElement("button", {
    "data-test": "annulla-invito",
    onClick: cancelDirectInvite,
    className: "text-secondary text-xs",
    style: {
      textDecoration: 'underline',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0
    }
  }, t.telepathy.cancel)), onlineInLobby.length > 0 && React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4"
  }, React.createElement("h3", {
    className: "text-white font-bold mb-3"
  }, t.telepathy.onlineUsers, " (", onlineInLobby.length, ")"), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }
  }, onlineInLobby.map(u => React.createElement("div", {
    key: u.id,
    "data-test": "riga-online",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.5rem 0.75rem',
      borderRadius: '0.75rem',
      background: 'rgba(255,255,255,0.05)'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem'
    }
  }, React.createElement("span", {
    style: {
      width: '0.6rem',
      height: '0.6rem',
      borderRadius: '50%',
      background: u.status === 'available' ? '#4ade80' : '#9ca3af',
      display: 'inline-block'
    }
  }), React.createElement("span", {
    className: "text-white text-sm font-medium",
    style: {
      cursor: 'pointer',
      textDecoration: 'underline dotted'
    },
    onClick: () => apriScheda({
      id: u.id,
      nickname: u.nickname,
      busy: u.status === 'busy'
    })
  }, u.nickname), React.createElement("span", {
    className: "text-secondary text-xs"
  }, u.status === 'busy' ? t.telepathy.inSession : t.telepathy.available)), u.status === 'available' && !invitoInUscita && !directInviteTarget && React.createElement("button", {
    onClick: () => sendDirectInvite(u),
    className: "btn-primary",
    style: {
      fontSize: '0.75rem',
      padding: '0.3rem 0.75rem'
    }
  }, t.telepathy.propose))))), invitabili.length > 0 && React.createElement("div", {
    "data-test": "lista-disponibili",
    className: "bg-glass-dark rounded-xl p-4"
  }, React.createElement("h3", {
    className: "text-white font-bold mb-3"
  }, testoInviti('disponibili'), " (", invitabili.length, ")"), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }
  }, invitabili.map(u => React.createElement("div", {
    key: u.id,
    "data-test": "riga-disponibile",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.5rem 0.75rem',
      borderRadius: '0.75rem',
      background: 'rgba(255,255,255,0.05)'
    }
  }, React.createElement("span", {
    className: "text-white text-sm font-medium",
    style: {
      cursor: 'pointer',
      textDecoration: 'underline dotted'
    },
    onClick: () => apriScheda({
      disponibilita_id: u.id,
      nickname: u.nickname
    })
  }, u.nickname), !invitoInUscita && !directInviteTarget && React.createElement("button", {
    onClick: () => sendDirectInvite({
      disponibilita_id: u.id,
      nickname: u.nickname
    }),
    className: "btn-primary",
    style: {
      fontSize: '0.75rem',
      padding: '0.3rem 0.75rem'
    }
  }, t.telepathy.propose))))), React.createElement("button", {
    onClick: startSearching,
    "data-test": "btn-casuale",
    className: "btn-primary w-full",
    style: {
      fontSize: '1.125rem'
    }
  }, t.telepathy.randomMatch), React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4"
  }, React.createElement("h3", {
    className: "text-white font-bold mb-3"
  }, "\uD83C\uDFC6 ", t.telepathy.leaderboardTitle), leaderboard.length === 0 ? React.createElement("p", {
    className: "text-secondary text-sm text-center",
    style: {
      padding: '1rem'
    }
  }, t.telepathy.leaderboardEmpty) : React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      fontSize: '0.7rem',
      color: '#9ca3af',
      padding: '0 0.5rem'
    }
  }, React.createElement("span", {
    style: {
      width: '2rem'
    }
  }, "#"), React.createElement("span", {
    style: {
      flex: 1
    }
  }, t.telepathy.leaderboardPlayer), React.createElement("span", {
    style: {
      width: '3.5rem',
      textAlign: 'right'
    }
  }, t.telepathy.leaderboardMatches), React.createElement("span", {
    style: {
      width: '4.5rem',
      textAlign: 'right'
    }
  }, t.telepathy.leaderboardAccuracy)), leaderboard.map((row, i) => React.createElement("div", {
    key: row.nickname || i,
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '0.5rem',
      borderRadius: '0.6rem',
      background: i < 3 ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)'
    }
  }, React.createElement("span", {
    style: {
      width: '2rem',
      fontWeight: 700,
      color: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : i === 2 ? '#d97706' : '#9ca3af'
    }
  }, i + 1), React.createElement("span", {
    className: "text-white",
    style: {
      flex: 1,
      fontWeight: 600
    }
  }, row.nickname), React.createElement("span", {
    className: "text-white",
    style: {
      width: '3.5rem',
      textAlign: 'right'
    }
  }, row.matches_count), React.createElement("span", {
    style: {
      width: '4.5rem',
      textAlign: 'right',
      color: '#4ade80'
    }
  }, row.rounds_count > 0 ? Math.round(row.matches_count / row.rounds_count * 100) + '%' : '—')))), React.createElement("button", {
    onClick: loadLeaderboard,
    className: "btn-secondary w-full",
    style: {
      marginTop: '0.75rem',
      fontSize: '0.8rem'
    }
  }, t.telepathy.leaderboardRefresh))), searchingPartner && React.createElement("div", {
    className: "text-center",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }
  }, React.createElement("div", {
    style: {
      fontSize: '4rem'
    },
    className: "pulse-glow"
  }, "\uD83D\uDD2E"), React.createElement("p", {
    className: "text-white text-xl"
  }, t.telepathy.searching), queueSize > 1 && React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4"
  }, React.createElement("p", {
    className: "text-primary"
  }, t.telepathy.queuePosition, ": ", React.createElement("span", {
    className: "text-white font-bold"
  }, queuePosition), " / ", queueSize), React.createElement("p", {
    className: "text-secondary text-sm mt-2"
  }, queueSize - 1, " ", queueSize > 2 ? t.telepathy.starseedsWaiting : t.telepathy.starseedWaiting)), React.createElement("button", {
    onClick: () => setSearchingPartner(false),
    className: "btn-secondary"
  }, t.telepathy.cancel)), (partner || sessionEnded) && React.createElement("div", {
    className: "tele-session",
    style: {
      display: 'flex',
      gap: '1rem',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      position: 'relative'
    }
  }, partner && !sessionEnded && React.createElement("button", {
    onClick: () => setShowEndSessionConfirm(true),
    "aria-label": t.telepathy.endSessionBtn,
    title: t.telepathy.endSessionBtn,
    style: {
      position: 'absolute',
      top: '0.5rem',
      right: '0.5rem',
      width: '2rem',
      height: '2rem',
      borderRadius: '50%',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(0,0,0,0.45)',
      color: 'white',
      fontSize: '1rem',
      cursor: 'pointer',
      lineHeight: 1,
      padding: 0,
      zIndex: 5
    }
  }, "\u2715"), partnerDisconnected && React.createElement("div", {
    style: {
      width: '100%',
      background: 'rgba(251,146,60,0.12)',
      border: '1px solid rgba(251,146,60,0.4)',
      borderRadius: '0.75rem',
      padding: '1.25rem',
      textAlign: 'center',
      marginBottom: '0.5rem'
    }
  }, React.createElement("div", {
    style: {
      fontSize: '2rem',
      marginBottom: '0.4rem'
    }
  }, "\uD83D\uDCE1"), React.createElement("p", {
    className: "text-white font-bold mb-2"
  }, partner?.nickname || t.telepathy.yourPartnerFallback, " ", t.telepathy.partnerLeftSuffix), React.createElement("button", {
    onClick: resetTelepathy,
    className: "btn-primary"
  }, t.telepathy.backToLobby)), React.createElement("div", {
    className: "tele-col tele-col-info",
    style: {
      flex: '0 0 180px',
      minWidth: '160px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem'
    }
  }, React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4"
  }, React.createElement("p", {
    className: "text-secondary text-xs mb-1"
  }, t.telepathy.partner), React.createElement("p", {
    "data-test": "partner-nome",
    className: "text-white font-bold"
  }, partner?.nickname), React.createElement("p", {
    className: "text-secondary text-xs mt-2"
  }, t.telepathy.yourRole), React.createElement("p", {
    className: "text-white font-bold"
  }, effectiveRole === 'sender' ? t.telepathy.roleSender : t.telepathy.roleReceiver)), React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4",
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    className: "text-secondary text-xs"
  }, t.telepathy.roundLabel), React.createElement("span", {
    className: "text-white text-sm font-bold"
  }, roundCount)), React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    className: "text-secondary text-xs"
  }, t.telepathy.matchLabel), React.createElement("span", {
    className: "text-white text-sm font-bold"
  }, sessionMatches, "/", roundCount || 0)), React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    className: "text-secondary text-xs"
  }, t.telepathy.levelLabel), React.createElement("span", {
    className: "text-white text-sm font-bold"
  }, levelLabel(currentLevel))), roundCount > 0 && React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    className: "text-secondary text-xs"
  }, t.telepathy.accuracyLabel), React.createElement("span", {
    className: "text-sm font-bold",
    style: {
      color: '#4ade80'
    }
  }, Math.round(sessionMatches / roundCount * 100), "%")))), React.createElement("div", {
    className: "tele-col tele-col-game",
    style: {
      flex: '1 1 280px',
      minWidth: '260px',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }
  }, partner && !sessionEnded && React.createElement("div", {
    className: `bg-glass-dark rounded-xl ${isMyTurn() ? 'pulse-glow' : ''}`,
    style: {
      padding: '0.9rem 1.1rem',
      border: '1px solid rgba(167,139,250,0.45)',
      background: 'rgba(167,139,250,0.12)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem'
    }
  }, React.createElement("span", {
    style: {
      fontSize: '1.5rem'
    }
  }, "\uD83D\uDD2E"), React.createElement("p", {
    className: "text-white",
    style: {
      fontSize: '1.05rem',
      fontWeight: 500,
      margin: 0,
      lineHeight: 1.3
    }
  }, getPartnerStatus())), partner && !showResult && !sessionEnded && React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }
  }, showLevelBanner && (amIChooser ? React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4",
    style: {
      border: '1px solid rgba(167,139,250,0.5)'
    }
  }, React.createElement("p", {
    className: "text-white font-bold text-center mb-3"
  }, t.telepathy.levelChooseTitle), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.5rem',
      flexWrap: 'wrap'
    }
  }, [{
    m: 'lvl3',
    ic: '🔣',
    lb: levelLabel('lvl3')
  }, {
    m: 'lvl5',
    ic: '🔣',
    lb: levelLabel('lvl5')
  }, {
    m: 'lvl7',
    ic: '🔣',
    lb: levelLabel('lvl7')
  }, {
    m: 'lvl9',
    ic: '🔣',
    lb: levelLabel('lvl9')
  }, {
    m: 'numbers',
    ic: '🔢',
    lb: t.telepathy.levelNumbers
  }, {
    m: 'words',
    ic: '🔤',
    lb: t.telepathy.levelWords
  }].filter(o => o.m !== currentLevel).map(o => React.createElement("button", {
    key: o.m,
    onClick: () => proposeLevelChange(o.m),
    className: "btn-secondary",
    style: {
      flex: '1 1 45%',
      fontSize: '0.85rem'
    }
  }, o.ic, " ", o.lb)), React.createElement("button", {
    onClick: () => proposeLevelChange('keep'),
    className: "btn-secondary",
    style: {
      flex: '1 1 45%',
      fontSize: '0.85rem'
    }
  }, t.telepathy.levelKeep))) : React.createElement("div", {
    role: "status",
    className: "bg-glass-dark rounded-xl p-4",
    style: {
      border: '1px solid rgba(167,139,250,0.5)',
      textAlign: 'center'
    }
  }, React.createElement("p", {
    className: "text-white",
    style: {
      margin: 0
    }
  }, "\uD83D\uDD2E ", partner?.nickname, " ", t.telepathy.levelWaiting))), !showLevelBanner && effectiveRole === 'sender' && !waitingForPartner && React.createElement("div", null, React.createElement("p", {
    className: "text-white text-center mb-2 font-medium"
  }, t.telepathy.pickSymbol), React.createElement("div", {
    className: "grid grid-cols-3",
    style: {
      gap: '0.6rem',
      marginBottom: '0.75rem'
    }
  }, getCurrentSymbols(currentLevel).map(symbol => React.createElement("button", {
    key: symbol.id,
    onClick: () => setSelectedSymbol(symbol.id),
    className: `symbol-btn ${selectedSymbol === symbol.id ? 'symbol-btn-selected' : ''}`
  }, symbol.icon))), React.createElement("button", {
    onClick: sendSymbol,
    disabled: !selectedSymbol || !!attesaInvitante,
    className: "btn-primary w-full"
  }, t.telepathy.sendTelepathically)), !showLevelBanner && effectiveRole === 'receiver' && !waitingForPartner && React.createElement("div", null, senderHasSent ? React.createElement("p", {
    className: "text-white text-center mb-2 font-medium"
  }, t.telepathy.symbolSentGuess) : React.createElement("p", {
    className: "text-primary text-center mb-2 font-medium"
  }, "\u23F3 ", partner?.nickname, " ", t.telepathy.waitingForSend), React.createElement("div", {
    className: `grid grid-cols-3 ${!senderHasSent ? 'symbols-locked' : ''}`,
    style: {
      gap: '0.6rem',
      marginBottom: '0.75rem'
    }
  }, getCurrentSymbols(currentLevel).map(symbol => React.createElement("button", {
    key: symbol.id,
    disabled: !senderHasSent,
    onClick: () => setGuessedSymbol(symbol.id),
    className: `symbol-btn ${guessedSymbol === symbol.id ? 'symbol-btn-selected' : ''}`
  }, symbol.icon))), React.createElement("button", {
    onClick: submitGuess,
    disabled: !guessedSymbol || !senderHasSent || !!attesaInvitante,
    className: "btn-primary w-full"
  }, t.telepathy.confirm)), !showLevelBanner && waitingForPartner && React.createElement("div", {
    className: "text-center"
  }, React.createElement("div", {
    style: {
      fontSize: '4rem'
    },
    className: "pulse-glow mb-4"
  }, "\uD83D\uDD2E"), React.createElement("p", {
    className: "text-primary"
  }, effectiveRole === 'sender' ? t.telepathy.senderWaiting : t.telepathy.receiverWaiting)), (showLevelBanner || waitingForPartner || effectiveRole === 'receiver' && !senderHasSent) && React.createElement("button", {
    onClick: leaveSession,
    className: "btn-secondary w-full",
    style: {
      marginTop: '0.25rem'
    }
  }, t.telepathy.leaveSession)), showResult && !partnerDisconnected && !sessionEnded && React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }
  }, React.createElement("div", {
    className: `${isMatch ? 'result-success' : 'result-try-again'} rounded-xl p-6 text-center`
  }, React.createElement("div", {
    style: {
      fontSize: '4rem'
    },
    className: "mb-4"
  }, isMatch ? '✨' : '🌟'), React.createElement("h3", {
    className: "text-2xl font-bold mb-2",
    style: {
      color: isMatch ? '#4ade80' : '#fb923c'
    }
  }, isMatch ? t.telepathy.matchResult : t.telepathy.noMatch), React.createElement("div", {
    className: "flex justify-center gap-6 mb-3",
    style: {
      marginTop: '0.5rem'
    }
  }, React.createElement("div", {
    className: "text-center"
  }, React.createElement("p", {
    className: "text-secondary text-sm mb-1"
  }, t.telepathy.sentLabel), React.createElement("span", {
    style: {
      fontSize: '2.5rem',
      color: '#e9d5ff'
    }
  }, getCurrentSymbols(resultLevel || currentLevel).find(s => s.id === ((resultRole || effectiveRole) === 'sender' ? selectedSymbol : partnerSymbol))?.icon || '·')), React.createElement("div", {
    className: "text-center"
  }, React.createElement("p", {
    className: "text-secondary text-sm mb-1"
  }, t.telepathy.guessedLabel), React.createElement("span", {
    style: {
      fontSize: '2.5rem',
      color: '#e9d5ff'
    }
  }, getCurrentSymbols(resultLevel || currentLevel).find(s => s.id === ((resultRole || effectiveRole) === 'receiver' ? guessedSymbol : partnerSymbol))?.icon || '·'))), isMatch && React.createElement("p", {
    className: "text-white"
  }, t.telepathy.resonance)), !showLevelBanner && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: '#a78bfa',
      fontWeight: 700
    }
  }, React.createElement("div", {
    style: {
      fontSize: '0.95rem',
      opacity: 0.85
    }
  }, t.telepathy.nextMatchIn), React.createElement("div", {
    className: "pulse-glow",
    style: {
      fontSize: '3rem',
      lineHeight: 1.1
    }
  }, resultCountdown ?? 4)), React.createElement("button", {
    onClick: endSession,
    className: "btn-secondary py-3 font-bold w-full"
  }, t.telepathy.endSessionBtn)), sessionEnded && !partnerDisconnected && React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }
  }, React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-6 text-center"
  }, React.createElement("div", {
    style: {
      fontSize: '4rem'
    },
    className: "mb-4"
  }, "\uD83C\uDF1F"), React.createElement("h3", {
    className: "text-2xl font-bold text-white mb-4"
  }, t.telepathy.sessionComplete), React.createElement("div", {
    className: "grid grid-cols-2 gap-4 mb-4"
  }, React.createElement("div", null, React.createElement("p", {
    className: "text-secondary text-sm mb-1"
  }, t.telepathy.roundsPlayed), React.createElement("p", {
    className: "text-2xl font-bold text-white"
  }, roundCount)), React.createElement("div", null, React.createElement("p", {
    className: "text-secondary text-sm mb-1"
  }, t.telepathy.correctMatches), React.createElement("p", {
    className: "text-2xl font-bold",
    style: {
      color: '#4ade80'
    }
  }, sessionMatches))), roundCount > 0 && React.createElement("p", {
    className: "text-white"
  }, t.telepathy.accuracyColon, " ", React.createElement("span", {
    className: "font-bold",
    style: {
      color: '#fbbf24'
    }
  }, Math.round(sessionMatches / roundCount * 100), "%"))), isGuest && guestCode && React.createElement("div", {
    style: {
      padding: '0.75rem',
      borderRadius: '0.75rem',
      background: 'rgba(251,191,36,0.1)',
      border: '1px solid rgba(251,191,36,0.3)',
      textAlign: 'center'
    }
  }, React.createElement("p", {
    style: {
      color: '#fbbf24',
      fontSize: '0.8rem',
      marginBottom: '0.25rem'
    }
  }, t.guestCodeLabel, ": ", React.createElement("strong", {
    style: {
      letterSpacing: '0.02em'
    }
  }, guestCode)), React.createElement("p", {
    style: {
      color: 'rgba(251,191,36,0.85)',
      fontSize: '0.7rem',
      lineHeight: 1.35,
      marginBottom: 0
    }
  }, t.guestCodeHint)), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem'
    }
  }, React.createElement("button", {
    onClick: playAgainSamePartner,
    className: "btn-primary w-full"
  }, t.telepathy.playAgainWith, " ", partner?.nickname), React.createElement("button", {
    onClick: resetTelepathy,
    className: "btn-secondary w-full"
  }, t.telepathy.backToLobbyCap)))), partner && !sessionEnded && React.createElement("div", {
    className: `tele-col tele-col-chat ${telepathyChatOpen ? 'chat-open' : ''}`,
    style: {
      flex: '0 0 200px',
      minWidth: '180px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }
  }, React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-3"
  }, React.createElement("div", {
    className: "tele-chat-header text-white text-sm font-bold mb-2",
    onClick: () => setTelepathyChatOpen(o => !o),
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      cursor: 'pointer'
    }
  }, React.createElement("span", null, "\uD83D\uDCAC ", t.telepathy.chatWith, " ", partner.nickname), React.createElement("span", {
    className: "tele-chat-chevron text-secondary",
    "aria-hidden": "true",
    style: {
      fontSize: '0.75rem'
    }
  }, telepathyChatOpen ? '▾' : '▸')), React.createElement("div", {
    style: {
      height: '220px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      marginBottom: '0.5rem'
    }
  }, telepathyChatMessages.length === 0 && React.createElement("p", {
    className: "text-secondary text-xs text-center",
    style: {
      marginTop: '2rem'
    }
  }, t.telepathy.noMessages), telepathyChatMessages.map(msg => React.createElement("div", {
    key: msg.id,
    style: {
      padding: '0.3rem 0.5rem',
      borderRadius: '0.5rem',
      background: msg.sender_name === nickname ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)',
      alignSelf: msg.sender_name === nickname ? 'flex-end' : 'flex-start',
      maxWidth: '90%'
    }
  }, msg.sender_name !== nickname && React.createElement("div", {
    className: "flex items-center gap-1"
  }, React.createElement("p", {
    className: "text-secondary",
    style: {
      fontSize: '0.65rem'
    }
  }, msg.sender_name), moderationMenu({
    author: msg.sender_name,
    type: 'telepathy_chat',
    id: msg.id,
    snapshot: msg.content
  })), React.createElement("p", {
    className: "text-white",
    style: {
      fontSize: '0.8rem'
    }
  }, msg.content)))), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.25rem'
    }
  }, React.createElement("input", {
    type: "text",
    value: newTelepathyMessage,
    onChange: e => setNewTelepathyMessage(e.target.value),
    onKeyDown: e => e.key === 'Enter' && sendTelepathyMessage(),
    placeholder: t.telepathy.chatPlaceholder,
    "aria-label": t.telepathy.chatPlaceholder,
    style: {
      flex: 1,
      background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '0.5rem',
      padding: '0.3rem 0.5rem',
      color: 'white',
      fontSize: '0.8rem',
      outline: 'none'
    }
  }), React.createElement("button", {
    onClick: sendTelepathyMessage,
    "aria-label": t.messages.send,
    style: {
      background: 'rgba(139,92,246,0.5)',
      border: 'none',
      borderRadius: '0.5rem',
      padding: '0.3rem 0.5rem',
      cursor: 'pointer',
      color: 'white',
      fontSize: '0.85rem'
    }
  }, "\u27A4"))))))), showEditProfile && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setShowEditProfile(false)
  }, React.createElement("div", {
    className: "modal-content",
    onClick: e => e.stopPropagation()
  }, React.createElement("button", {
    onClick: () => setShowEditProfile(false),
    "aria-label": t.social.close,
    style: {
      position: 'absolute',
      top: '1rem',
      right: '1rem',
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      borderRadius: '50%',
      width: '2rem',
      height: '2rem',
      cursor: 'pointer',
      color: '#fff',
      fontSize: '1.1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10
    }
  }, "\u2715"), React.createElement("div", {
    className: "text-center mb-6"
  }, React.createElement("div", {
    style: {
      fontSize: '3rem'
    },
    className: "mb-2"
  }, profile.avatar || '👤'), React.createElement("h2", {
    className: "text-2xl font-bold text-white mb-2"
  }, t.editProfile), React.createElement("div", {
    style: {
      marginTop: '0.5rem'
    }
  }, React.createElement("span", {
    style: {
      fontSize: '0.8rem',
      padding: '0.3rem 0.85rem',
      borderRadius: '9999px',
      background: isGuest ? 'rgba(251,191,36,0.2)' : 'rgba(34,197,94,0.2)',
      color: isGuest ? '#fbbf24' : '#4ade80',
      border: isGuest ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(34,197,94,0.4)',
      fontWeight: 600
    }
  }, isGuest ? t.guestBadge : t.registeredBadge)), !isGuest && userEmail && React.createElement("p", {
    className: "text-secondary text-sm",
    style: {
      marginTop: '0.5rem'
    }
  }, userEmail), isGuest && React.createElement("div", {
    style: {
      marginTop: '0.75rem',
      padding: '0.75rem',
      borderRadius: '0.75rem',
      background: 'rgba(251,191,36,0.1)',
      border: '1px solid rgba(251,191,36,0.3)'
    }
  }, React.createElement("p", {
    style: {
      color: '#fbbf24',
      fontSize: '0.8rem',
      marginBottom: '0.25rem'
    }
  }, t.guestCodeLabel, ": ", React.createElement("strong", {
    style: {
      letterSpacing: '0.02em'
    }
  }, guestCode)), React.createElement("p", {
    style: {
      color: 'rgba(251,191,36,0.85)',
      fontSize: '0.7rem',
      marginBottom: '0.7rem',
      lineHeight: 1.35
    }
  }, t.guestCodeHint), React.createElement("p", {
    style: {
      color: '#fbbf24',
      fontSize: '0.875rem'
    }
  }, t.registerInvite), React.createElement("button", {
    onClick: () => {
      setShowEditProfile(false);
      handleLogout();
      setTimeout(() => setAuthTab('register'), 100);
    },
    className: "btn-primary",
    style: {
      marginTop: '0.5rem',
      fontSize: '0.9rem',
      padding: '0.5rem 1.5rem'
    }
  }, t.register))), React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4 mb-4"
  }, React.createElement("div", {
    className: "grid grid-cols-2 gap-3 mb-3"
  }, React.createElement("div", {
    className: "text-center"
  }, React.createElement("p", {
    className: "text-secondary text-xs mb-1"
  }, t.social.telepathyScore), React.createElement("p", {
    className: "text-2xl font-bold",
    style: {
      color: '#fbbf24'
    }
  }, totalRounds)), React.createElement("div", {
    className: "text-center"
  }, React.createElement("p", {
    className: "text-secondary text-xs mb-1"
  }, t.social.bestScore), React.createElement("p", {
    className: "text-2xl font-bold",
    style: {
      color: '#4ade80'
    }
  }, totalRounds > 0 ? Math.round(totalMatches / totalRounds * 100) : 0, "%"))), React.createElement("div", {
    className: "flex items-center justify-between",
    style: {
      padding: '0.5rem 0'
    }
  }, React.createElement("span", {
    className: "text-white text-sm"
  }, t.showTelepathyScore), React.createElement("button", {
    onClick: async () => {
      const oldVal = showTelepathyScore;
      const newVal = !oldVal;
      setShowTelepathyScore(newVal);
      localStorage.setItem('ga_show_telepathy', String(newVal));
      if (!isGuest && nickname && passwordHash) {
        const {
          data: esito,
          error
        } = await supabase.rpc('update_my_profile', {
          p_nickname: nickname,
          p_password_hash: passwordHash,
          p_fields: {
            show_telepathy_score: newVal
          }
        });
        if (error || !esito || !esito.ok) {
          setShowTelepathyScore(oldVal);
          localStorage.setItem('ga_show_telepathy', String(oldVal));
          alert(t.profileSaveFailed);
        }
      }
    },
    style: {
      width: '3rem',
      height: '1.5rem',
      borderRadius: '9999px',
      background: showTelepathyScore ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.2)',
      border: showTelepathyScore ? '1px solid rgba(34,197,94,0.7)' : '1px solid rgba(255,255,255,0.3)',
      cursor: 'pointer',
      position: 'relative',
      transition: 'all 0.3s'
    }
  }, React.createElement("div", {
    style: {
      width: '1.1rem',
      height: '1.1rem',
      borderRadius: '50%',
      background: '#fff',
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      left: showTelepathyScore ? 'calc(100% - 1.3rem)' : '0.15rem',
      transition: 'all 0.3s'
    }
  }))), React.createElement("div", {
    className: "flex items-center justify-between",
    style: {
      padding: '0.5rem 0'
    }
  }, React.createElement("span", {
    className: "text-white text-sm"
  }, t.pushImpostazioni), React.createElement("button", {
    "data-test": "push-interruttore",
    onClick: () => pushAttive ? spegniPush() : rispondiPush(true),
    style: {
      width: '3rem',
      height: '1.5rem',
      borderRadius: '9999px',
      background: pushAttive ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.2)',
      border: pushAttive ? '1px solid rgba(34,197,94,0.7)' : '1px solid rgba(255,255,255,0.3)',
      cursor: 'pointer',
      position: 'relative',
      transition: 'all 0.3s'
    }
  }, React.createElement("div", {
    style: {
      width: '1.1rem',
      height: '1.1rem',
      borderRadius: '50%',
      background: '#fff',
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      left: pushAttive ? 'calc(100% - 1.3rem)' : '0.15rem',
      transition: 'all 0.3s'
    }
  }))), renderInterruttoreInviti('interruttore-inviti-impostazioni')), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem'
    }
  }, React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.profile.avatar), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(2.5rem, 1fr))',
      gap: '0.5rem',
      maxHeight: '11rem',
      overflowY: 'auto'
    }
  }, avatarEmojis.map(emoji => React.createElement("button", {
    key: emoji,
    onClick: () => setProfile({
      ...profile,
      avatar: emoji
    }),
    style: {
      fontSize: '1.5rem',
      padding: '0.5rem',
      borderRadius: '0.5rem',
      border: profile.avatar === emoji ? '2px solid #a78bfa' : '2px solid transparent',
      background: profile.avatar === emoji ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)',
      cursor: 'pointer',
      transition: 'all 0.2s'
    }
  }, emoji)))), React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.profile.bio), React.createElement("textarea", {
    value: profile.bio,
    onChange: e => setProfile({
      ...profile,
      bio: e.target.value
    }),
    placeholder: t.profile.bioPlaceholder,
    rows: "3",
    maxLength: 500
  })), React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.profile.country), React.createElement("input", {
    type: "text",
    value: profile.country,
    onChange: e => setProfile({
      ...profile,
      country: e.target.value
    }),
    placeholder: t.profile.countryPlaceholder,
    maxLength: 100
  })), React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.profile.interests), React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.5rem'
    }
  }, interestKeys.map(key => React.createElement("button", {
    key: key,
    onClick: () => toggleInterest(key),
    style: {
      padding: '0.5rem 1rem',
      borderRadius: '9999px',
      border: profile.interests.includes(key) ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.2)',
      background: profile.interests.includes(key) ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)',
      color: '#fff',
      cursor: 'pointer',
      fontSize: '0.875rem',
      transition: 'all 0.2s'
    }
  }, t.profile.interestsList[key])))), !isGuest && React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.changePassword), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.5rem'
    }
  }, React.createElement("input", {
    type: "password",
    value: profilePassword,
    onChange: e => {
      setProfilePassword(e.target.value);
      setProfilePasswordMsg('');
    },
    placeholder: "New password...",
    style: {
      flex: 1
    }
  }), React.createElement("button", {
    className: "btn-secondary px-4",
    disabled: !profilePassword.trim(),
    onClick: async () => {
      const hash = await deriveStrongHash(profilePassword.trim());
      const {
        data: esito,
        error
      } = await supabase.rpc('change_password', {
        p_nickname: nickname,
        p_old_hash: passwordHash,
        p_new_hash: hash
      });
      if (error || !esito || !esito.ok) {
        setProfilePasswordMsg(t.passwordChangeFailed);
        return;
      }
      setPasswordHash(hash);
      localStorage.setItem('ga_pwhash', hash);
      setProfilePassword('');
      setProfilePasswordMsg(t.passwordSet);
      setTimeout(() => setProfilePasswordMsg(''), 3000);
    }
  }, t.changePassword)), profilePasswordMsg && React.createElement("div", {
    className: `${profilePasswordMsg === t.passwordChangeFailed ? 'result-try-again' : 'result-success'} rounded-xl p-2 text-center mt-2`
  }, React.createElement("p", {
    style: {
      color: profilePasswordMsg === t.passwordChangeFailed ? '#fb923c' : '#4ade80'
    },
    className: "font-bold text-sm"
  }, profilePasswordMsg))), !isGuest && React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(255,255,255,0.1)',
      paddingTop: '1.25rem'
    }
  }, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.moderation.blockedUsers), blockedUsers.length === 0 ? React.createElement("p", {
    className: "text-secondary text-xs"
  }, t.moderation.noBlocked) : blockedUsers.map(nick => React.createElement("div", {
    key: nick,
    className: "flex items-center gap-2",
    style: {
      padding: '0.35rem 0'
    }
  }, React.createElement("span", {
    className: "text-white text-sm"
  }, nick), React.createElement("button", {
    className: "btn-secondary",
    style: {
      marginLeft: 'auto',
      fontSize: '0.75rem',
      padding: '0.3rem 0.7rem'
    },
    onClick: () => doUnblock(nick)
  }, t.moderation.unblock))), React.createElement("a", {
    href: "regole.html",
    target: "_blank",
    rel: "noopener",
    className: "text-secondary text-xs",
    style: {
      display: 'inline-block',
      marginTop: '0.5rem'
    }
  }, t.moderation.reportRules)), !isGuest && React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(255,255,255,0.1)',
      paddingTop: '1.25rem'
    }
  }, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.gdprTitle), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }
  }, React.createElement("button", {
    className: "btn-secondary w-full",
    disabled: gdprBusy,
    onClick: exportMyData
  }, gdprBusy ? t.gdprExporting : t.gdprExport), React.createElement("button", {
    className: "w-full",
    style: {
      padding: '0.6rem',
      borderRadius: '0.75rem',
      border: '1px solid rgba(248,113,113,0.5)',
      background: 'rgba(248,113,113,0.12)',
      color: '#fca5a5',
      cursor: 'pointer',
      fontWeight: 600
    },
    onClick: () => {
      setDeleteConfirmText('');
      setShowDeleteAccount(true);
    }
  }, t.gdprDelete))), React.createElement("button", {
    onClick: () => {
      saveProfile();
      setShowEditProfile(false);
    },
    className: "btn-primary w-full",
    style: {
      fontSize: '1.125rem',
      marginTop: '0.5rem'
    }
  }, profileSaved ? t.profile.saved : t.profile.save), profileSaved && React.createElement("div", {
    className: "result-success rounded-xl p-3 text-center"
  }, React.createElement("p", {
    style: {
      color: '#4ade80'
    },
    className: "font-bold"
  }, t.profile.saved))))), viewingProfile && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setViewingProfile(null)
  }, React.createElement("div", {
    className: "modal-content",
    onClick: e => e.stopPropagation()
  }, React.createElement("button", {
    onClick: () => setViewingProfile(null),
    "aria-label": t.social.close,
    style: {
      position: 'absolute',
      top: '1rem',
      right: '1rem',
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      borderRadius: '50%',
      width: '2rem',
      height: '2rem',
      cursor: 'pointer',
      color: '#fff',
      fontSize: '1.1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10
    }
  }, "\u2715"), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }
  }, viewingProfile.empty ? React.createElement("div", {
    className: "text-center py-4"
  }, React.createElement("div", {
    style: {
      fontSize: '4rem'
    },
    className: "mb-3"
  }, "\uD83D\uDC64"), React.createElement("p", {
    className: "text-white text-xl font-bold mb-2"
  }, viewingProfile.nickname), React.createElement("p", {
    className: "text-primary text-sm"
  }, t.social.noProfile)) : React.createElement(React.Fragment, null, React.createElement("div", {
    className: "text-center"
  }, React.createElement("div", {
    style: {
      fontSize: '4rem'
    },
    className: "mb-2"
  }, viewingProfile.avatar || '👤'), React.createElement("h2", {
    className: "text-2xl font-bold text-white"
  }, viewingProfile.nickname)), viewingProfile.bio && React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-4"
  }, React.createElement("p", {
    className: "text-white",
    style: {
      whiteSpace: 'pre-wrap'
    }
  }, viewingProfile.bio)), viewingProfile.nickname !== nickname && !isGuest && React.createElement("div", {
    className: "flex gap-2",
    style: {
      justifyContent: 'center'
    }
  }, React.createElement("button", {
    className: "btn-secondary",
    style: {
      fontSize: '0.8rem'
    },
    onClick: () => setReportTarget({
      author: viewingProfile.nickname,
      type: 'profile',
      id: null,
      snapshot: viewingProfile.bio || ''
    })
  }, t.moderation.report), blockedUsers.includes(viewingProfile.nickname) ? React.createElement("button", {
    className: "btn-secondary",
    style: {
      fontSize: '0.8rem'
    },
    onClick: () => doUnblock(viewingProfile.nickname)
  }, t.moderation.unblock) : React.createElement("button", {
    className: "btn-secondary",
    style: {
      fontSize: '0.8rem',
      color: '#fca5a5'
    },
    onClick: () => setBlockTarget(viewingProfile.nickname)
  }, t.moderation.block)), viewingProfile.country && React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-3 text-center"
  }, React.createElement("p", {
    className: "text-secondary text-xs mb-1"
  }, t.profile.country), React.createElement("p", {
    className: "text-white font-bold"
  }, viewingProfile.country)), viewingProfile.interests && viewingProfile.interests.length > 0 && React.createElement("div", null, React.createElement("p", {
    className: "text-secondary text-xs mb-2"
  }, t.profile.interests), React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.5rem'
    }
  }, viewingProfile.interests.map(key => React.createElement("span", {
    key: key,
    style: {
      padding: '0.35rem 0.85rem',
      borderRadius: '9999px',
      border: '1px solid rgba(167,139,250,0.5)',
      background: 'rgba(139, 92, 246, 0.3)',
      color: '#e9d5ff',
      fontSize: '0.8rem'
    }
  }, t.profile.interestsList[key] || key)))), viewingProfile.showTelepathyScore !== false && React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-3 text-center"
  }, React.createElement("p", {
    className: "text-secondary text-xs mb-1"
  }, t.social.telepathyScore), React.createElement("p", {
    className: "text-2xl font-bold",
    style: {
      color: '#fbbf24'
    }
  }, viewingProfile.telepathyRounds)), React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-3 text-center"
  }, React.createElement("p", {
    className: "text-secondary text-xs mb-1"
  }, t.social.bestScore), React.createElement("p", {
    className: "text-2xl font-bold",
    style: {
      color: '#4ade80'
    }
  }, viewingProfile.telepathyRounds > 0 ? Math.round(viewingProfile.telepathyMatches / viewingProfile.telepathyRounds * 100) : 0, "%")))), viewingProfile.nickname !== nickname && isGuest && React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-3 text-center"
  }, React.createElement("p", {
    className: "text-secondary text-sm"
  }, t.messages.guestPrompt)), viewingProfile.nickname !== nickname && !isGuest && !viewingProfile.registered && React.createElement("div", {
    className: "bg-glass-dark rounded-xl p-3 text-center"
  }, React.createElement("p", {
    className: "text-secondary text-sm"
  }, t.messages.receiverNotRegistered)), viewingProfile.nickname !== nickname && !isGuest && viewingProfile.registered && React.createElement("div", null, React.createElement("p", {
    className: "text-secondary text-xs mb-2"
  }, t.messages.title), React.createElement("div", {
    className: "bg-glass-dark rounded-xl",
    style: {
      maxHeight: '250px',
      display: 'flex',
      flexDirection: 'column'
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      maxHeight: '180px'
    }
  }, getConversationMessages(viewingProfile.nickname).length === 0 ? React.createElement("p", {
    className: "text-secondary text-sm text-center",
    style: {
      padding: '1rem 0'
    }
  }, t.messages.noConversations) : getConversationMessages(viewingProfile.nickname).map(msg => {
    const isMe = msg.sender_name === nickname;
    return React.createElement("div", {
      key: msg.id,
      style: {
        alignSelf: isMe ? 'flex-end' : 'flex-start',
        maxWidth: '80%'
      }
    }, React.createElement("div", {
      style: {
        padding: '0.4rem 0.75rem',
        borderRadius: isMe ? '0.75rem 0.75rem 0.15rem 0.75rem' : '0.75rem 0.75rem 0.75rem 0.15rem',
        background: isMe ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.1)',
        border: isMe ? '1px solid rgba(139, 92, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)'
      }
    }, React.createElement("p", {
      className: "text-white",
      style: {
        fontSize: '0.8rem'
      }
    }, msg.content)), React.createElement("div", {
      className: "flex items-center gap-1",
      style: {
        justifyContent: isMe ? 'flex-end' : 'flex-start'
      }
    }, React.createElement("p", {
      style: {
        fontSize: '0.6rem',
        color: '#c4b5fd',
        marginTop: '0.1rem'
      }
    }, new Date(msg.created_at).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })), !isMe && moderationMenu({
      author: msg.sender_name,
      type: 'private_message',
      id: msg.id,
      snapshot: msg.content
    })));
  })), React.createElement("div", {
    style: {
      padding: '0.5rem 0.75rem',
      borderTop: '1px solid rgba(255,255,255,0.1)'
    }
  }, React.createElement("div", {
    className: "flex gap-2"
  }, React.createElement("input", {
    type: "text",
    value: newPrivateMessage,
    onChange: e => setNewPrivateMessage(e.target.value),
    onKeyPress: e => {
      if (e.key === 'Enter' && newPrivateMessage.trim()) {
        submitPrivateMessage();
      }
    },
    placeholder: t.messages.placeholder,
    "aria-label": t.messages.placeholder,
    style: {
      flex: 1,
      padding: '0.5rem 0.75rem',
      fontSize: '0.85rem'
    }
  }), React.createElement("button", {
    onClick: () => {
      if (newPrivateMessage.trim()) submitPrivateMessage();
    },
    className: "btn-primary",
    style: {
      padding: '0.5rem 1rem'
    },
    "aria-label": t.messages.send,
    disabled: savingContent
  }, React.createElement(Send, {
    style: {
      width: '1rem',
      height: '1rem'
    }
  })))))), React.createElement("button", {
    onClick: () => {
      setViewingProfile(null);
      setNewPrivateMessage('');
    },
    className: "btn-secondary w-full mt-2"
  }, t.social.close)))), errorToast && React.createElement("div", {
    role: "alert",
    style: {
      position: 'fixed',
      bottom: '1rem',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(360px, calc(100vw - 2rem))',
      background: 'linear-gradient(135deg, rgba(220,38,38,0.96) 0%, rgba(248,113,113,0.93) 100%)',
      border: '1px solid rgba(255,255,255,0.25)',
      boxShadow: '0 12px 40px rgba(220,38,38,0.45)',
      borderRadius: '0.85rem',
      padding: '0.85rem 1rem',
      zIndex: 9999,
      animation: 'toast-rise 0.35s ease-out'
    }
  }, React.createElement("p", {
    className: "text-white font-bold",
    style: {
      fontSize: '0.9rem',
      margin: 0,
      textAlign: 'center'
    }
  }, "\u26A0\uFE0F ", errorToast)), openMenu && React.createElement("div", {
    "data-moderation-menu": true,
    onClick: e => e.stopPropagation(),
    style: {
      position: 'fixed',
      zIndex: 9997,
      top: openMenu.top != null ? `${openMenu.top}px` : undefined,
      bottom: openMenu.bottom != null ? `${openMenu.bottom}px` : undefined,
      right: `${openMenu.right}px`,
      background: 'rgba(17,12,30,0.98)',
      border: '1px solid rgba(167,139,250,0.35)',
      borderRadius: '0.75rem',
      padding: '0.25rem',
      minWidth: '11rem',
      boxShadow: '0 10px 30px rgba(0,0,0,0.55)'
    }
  }, React.createElement("button", {
    onClick: () => {
      const m = openMenu;
      setOpenMenu(null);
      setReportTarget({
        author: m.author,
        type: m.type,
        id: m.id,
        snapshot: m.snapshot
      });
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      background: 'none',
      border: 'none',
      color: '#e9d5ff',
      padding: '0.6rem 0.75rem',
      cursor: 'pointer'
    }
  }, t.moderation.report), React.createElement("button", {
    onClick: () => {
      const a = openMenu.author;
      setOpenMenu(null);
      setBlockTarget(a);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      background: 'none',
      border: 'none',
      color: '#fca5a5',
      padding: '0.6rem 0.75rem',
      cursor: 'pointer'
    }
  }, t.moderation.block)), blockTarget && React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 9998,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'rgba(0,0,0,0.7)'
    },
    onClick: () => setBlockTarget(null)
  }, React.createElement("div", {
    className: "bg-glass rounded-2xl border-glass p-4",
    style: {
      maxWidth: '22rem',
      width: '100%'
    },
    onClick: e => e.stopPropagation()
  }, React.createElement("h3", {
    className: "text-white font-bold mb-2"
  }, t.moderation.blockTitle), React.createElement("p", {
    className: "text-primary font-medium mb-1"
  }, blockTarget), React.createElement("p", {
    className: "text-secondary text-sm"
  }, t.moderation.blockConfirm), React.createElement("div", {
    className: "flex gap-2",
    style: {
      marginTop: '1rem'
    }
  }, React.createElement("button", {
    style: {
      padding: '0.6rem 1rem',
      borderRadius: '0.75rem',
      flex: 1,
      border: '1px solid rgba(248,113,113,0.5)',
      background: 'rgba(248,113,113,0.12)',
      color: '#fca5a5',
      cursor: 'pointer',
      fontWeight: 600
    },
    onClick: () => {
      const n = blockTarget;
      setBlockTarget(null);
      doBlock(n);
    }
  }, t.moderation.block), React.createElement("button", {
    className: "btn-secondary",
    style: {
      flex: 1
    },
    onClick: () => setBlockTarget(null)
  }, t.moderation.cancel)))), ritualToDelete && React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 9998,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'rgba(0,0,0,0.7)'
    },
    onClick: () => setRitualToDelete(null)
  }, React.createElement("div", {
    className: "bg-glass rounded-2xl border-glass p-4",
    style: {
      maxWidth: '22rem',
      width: '100%'
    },
    onClick: e => e.stopPropagation()
  }, React.createElement("h3", {
    className: "text-white font-bold mb-2"
  }, t.rituals.deleteTitle), React.createElement("p", {
    className: "text-primary font-medium mb-1"
  }, ritualToDelete.name), React.createElement("p", {
    className: "text-secondary text-sm"
  }, t.rituals.deleteBody), React.createElement("div", {
    className: "flex gap-2",
    style: {
      marginTop: '1rem'
    }
  }, React.createElement("button", {
    "data-test": "delete-ritual-confirm",
    style: {
      padding: '0.6rem 1rem',
      borderRadius: '0.75rem',
      flex: 1,
      border: '1px solid rgba(248,113,113,0.5)',
      background: 'rgba(248,113,113,0.12)',
      color: '#fca5a5',
      cursor: 'pointer',
      fontWeight: 600
    },
    onClick: () => {
      const r = ritualToDelete;
      setRitualToDelete(null);
      doDeleteRitual(r.id);
    }
  }, t.rituals.deleteYes), React.createElement("button", {
    className: "btn-secondary",
    style: {
      flex: 1
    },
    "data-test": "delete-ritual-cancel",
    onClick: () => setRitualToDelete(null)
  }, t.rituals.deleteNo)))), ritualToStop && React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 9998,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'rgba(0,0,0,0.7)'
    },
    onClick: () => setRitualToStop(null)
  }, React.createElement("div", {
    className: "bg-glass rounded-2xl border-glass p-4",
    style: {
      maxWidth: '22rem',
      width: '100%'
    },
    onClick: e => e.stopPropagation()
  }, React.createElement("h3", {
    className: "text-white font-bold mb-2"
  }, t.rituals.stopTitle), React.createElement("p", {
    className: "text-primary font-medium mb-1"
  }, ritualToStop.name), React.createElement("p", {
    className: "text-secondary text-sm"
  }, t.rituals.stopBody), React.createElement("div", {
    className: "flex gap-2",
    style: {
      marginTop: '1rem'
    }
  }, React.createElement("button", {
    "data-test": "stop-ritual-confirm",
    style: {
      padding: '0.6rem 1rem',
      borderRadius: '0.75rem',
      flex: 1,
      border: '1px solid rgba(248,113,113,0.5)',
      background: 'rgba(248,113,113,0.12)',
      color: '#fca5a5',
      cursor: 'pointer',
      fontWeight: 600
    },
    onClick: () => {
      doFermaRituale(ritualToStop.id);
      setRitualToStop(null);
    }
  }, t.rituals.stopYes), React.createElement("button", {
    className: "btn-secondary",
    style: {
      flex: 1
    },
    "data-test": "stop-ritual-cancel",
    onClick: () => setRitualToStop(null)
  }, t.rituals.stopNo)))), reportTarget && React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 9998,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'rgba(0,0,0,0.7)'
    },
    onClick: () => setReportTarget(null)
  }, React.createElement("div", {
    className: "bg-glass rounded-2xl border-glass p-4",
    style: {
      maxWidth: '26rem',
      width: '100%',
      maxHeight: '90vh',
      overflowY: 'auto'
    },
    onClick: e => e.stopPropagation()
  }, React.createElement("h3", {
    className: "text-white font-bold mb-2"
  }, t.moderation.reportTitle), React.createElement("p", {
    className: "text-primary font-medium",
    style: {
      marginBottom: '0.25rem'
    }
  }, reportTarget.author), reportTarget.snapshot && React.createElement("p", {
    className: "text-secondary text-xs",
    style: {
      marginBottom: '0.75rem',
      fontStyle: 'italic',
      overflow: 'hidden',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical'
    }
  }, "\xAB", String(reportTarget.snapshot).slice(0, 160), "\xBB"), React.createElement("p", {
    className: "text-secondary text-xs mb-2"
  }, t.moderation.reportWhy), ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'other'].map(k => React.createElement("label", {
    key: k,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      color: '#e9d5ff',
      padding: '0.35rem 0',
      cursor: 'pointer'
    }
  }, React.createElement("input", {
    type: "radio",
    name: "report-reason",
    value: k,
    checked: reportReason === k,
    onChange: () => setReportReason(k)
  }), t.moderation.reasons[k])), React.createElement("textarea", {
    value: reportNotes,
    onChange: e => setReportNotes(e.target.value),
    placeholder: t.moderation.reportNotes,
    "aria-label": t.moderation.reportNotes,
    maxLength: 1000,
    style: {
      width: '100%',
      marginTop: '0.75rem',
      minHeight: '4.5rem',
      background: 'rgba(255,255,255,0.06)',
      color: '#fff',
      border: '1px solid rgba(167,139,250,0.3)',
      borderRadius: '0.6rem',
      padding: '0.5rem'
    }
  }), React.createElement("div", {
    className: "flex gap-2",
    style: {
      marginTop: '0.75rem'
    }
  }, React.createElement("button", {
    className: "btn-primary",
    onClick: doReport
  }, t.moderation.reportSend), React.createElement("button", {
    className: "btn-secondary",
    onClick: () => setReportTarget(null)
  }, t.moderation.cancel)), React.createElement("a", {
    href: "regole.html",
    target: "_blank",
    rel: "noopener",
    className: "text-secondary text-xs",
    style: {
      display: 'inline-block',
      marginTop: '0.75rem'
    }
  }, t.moderation.reportRules))), avvisoInviti && React.createElement("div", {
    "data-test": "avviso-inviti",
    role: "status",
    style: {
      position: 'fixed',
      bottom: '4.5rem',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(360px, calc(100vw - 2rem))',
      background: 'rgba(30,27,75,0.96)',
      border: '1px solid rgba(167,139,250,0.5)',
      borderRadius: '0.85rem',
      padding: '0.85rem 1rem',
      zIndex: 9999
    }
  }, React.createElement("p", {
    className: "text-white",
    style: {
      fontSize: '0.9rem',
      margin: 0,
      textAlign: 'center'
    }
  }, avvisoInviti)), schedaInvito && React.createElement("div", {
    "data-test": "scheda-invito",
    role: "dialog",
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }
  }, React.createElement("div", {
    className: "bg-glass-dark rounded-2xl",
    style: {
      maxWidth: '22rem',
      width: '100%',
      padding: '1.25rem'
    }
  }, React.createElement("h3", {
    className: "text-white font-bold"
  }, schedaInvito.dati.nickname), schedaInvito.dati.country && React.createElement("p", {
    className: "text-secondary text-sm"
  }, schedaInvito.dati.country), schedaInvito.dati.bio && React.createElement("p", {
    className: "text-white text-sm",
    style: {
      margin: '0.5rem 0'
    }
  }, schedaInvito.dati.bio), schedaInvito.dati.prove != null && React.createElement("p", {
    className: "text-secondary text-sm"
  }, testoInviti('prove'), ": ", schedaInvito.dati.prove, IH && IH.percentuale(schedaInvito.dati.prove, schedaInvito.dati.indovinate) ? ` · ${testoInviti('indovinate')}: ${IH.percentuale(schedaInvito.dati.prove, schedaInvito.dati.indovinate)}` : ''), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      marginTop: '1rem'
    }
  }, !invitoInUscita && !directInviteTarget && !schedaInvito.chi.busy && React.createElement("button", {
    "data-test": "btn-invita",
    className: "btn-primary",
    onClick: () => {
      const chi = schedaInvito.chi;
      setSchedaInvito(null);
      sendDirectInvite(chi);
    }
  }, testoInviti('invita')), React.createElement("button", {
    "data-test": "btn-blocca-scheda",
    className: "btn-secondary",
    onClick: () => setConfermaBlocco({
      nome: schedaInvito.dati.nickname,
      ...(schedaInvito.chi.disponibilita_id ? {
        p_disponibilita_id: schedaInvito.chi.disponibilita_id
      } : {
        p_session_online: schedaInvito.chi.id
      })
    })
  }, testoInviti('blocca')), React.createElement("button", {
    "data-test": "btn-chiudi-scheda",
    className: "btn-secondary",
    onClick: () => setSchedaInvito(null)
  }, testoInviti('chiudi'))))), confermaBlocco && React.createElement("div", {
    "data-test": "conferma-blocco",
    role: "dialog",
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }
  }, React.createElement("div", {
    className: "bg-glass-dark rounded-2xl",
    style: {
      maxWidth: '22rem',
      width: '100%',
      padding: '1.25rem'
    }
  }, React.createElement("p", {
    className: "text-white",
    style: {
      marginBottom: '1rem'
    }
  }, testoInviti('conferma_blocco', {
    nome: confermaBlocco.nome
  })), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.5rem'
    }
  }, React.createElement("button", {
    "data-test": "btn-conferma-blocco",
    className: "btn-primary",
    style: {
      flex: 1
    },
    onClick: confermaBloccoInviti
  }, testoInviti('conferma')), React.createElement("button", {
    "data-test": "btn-annulla-blocco",
    className: "btn-secondary",
    style: {
      flex: 1
    },
    onClick: () => setConfermaBlocco(null)
  }, testoInviti('annulla'))))), infoToast && React.createElement("div", {
    role: "status",
    style: {
      position: 'fixed',
      bottom: '1rem',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(360px, calc(100vw - 2rem))',
      background: 'linear-gradient(135deg, rgba(109,40,217,0.96) 0%, rgba(167,139,250,0.93) 100%)',
      border: '1px solid rgba(255,255,255,0.25)',
      boxShadow: '0 12px 40px rgba(109,40,217,0.45)',
      borderRadius: '0.85rem',
      padding: '0.85rem 1rem',
      zIndex: 9999,
      animation: 'toast-rise 0.35s ease-out'
    }
  }, React.createElement("p", {
    className: "text-white font-bold",
    style: {
      fontSize: '0.9rem',
      margin: 0,
      textAlign: 'center'
    }
  }, "\u2705 ", infoToast)), incomingInvite && (!partner || sessionEnded) && React.createElement("div", {
    className: "invite-toast",
    style: {
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      width: 'min(360px, calc(100vw - 2rem))',
      background: 'linear-gradient(135deg, rgba(124,58,237,0.95) 0%, rgba(167,139,250,0.92) 100%)',
      border: '1px solid rgba(255,255,255,0.25)',
      boxShadow: '0 12px 40px rgba(124,58,237,0.5), 0 0 24px rgba(167,139,250,0.4)',
      borderRadius: '0.85rem',
      padding: '0.9rem 1rem',
      zIndex: 9999,
      animation: 'toast-slide-in 0.35s ease-out'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.7rem',
      marginBottom: '0.6rem'
    }
  }, React.createElement("span", {
    style: {
      fontSize: '1.6rem'
    }
  }, "\uD83E\uDDE0"), React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("p", {
    className: "text-white font-bold",
    style: {
      fontSize: '0.95rem',
      margin: 0,
      lineHeight: 1.2
    }
  }, "\u2728 ", React.createElement("strong", null, incomingInvite.from_name)), React.createElement("p", {
    className: "text-white",
    style: {
      fontSize: '0.78rem',
      margin: 0,
      opacity: 0.9,
      lineHeight: 1.3
    }
  }, t.telepathy.inviteModalBody))), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.5rem'
    }
  }, React.createElement("button", {
    "data-test": "btn-accetta",
    onClick: acceptInvite,
    className: "btn-primary",
    style: {
      flex: 1,
      fontSize: '0.85rem',
      padding: '0.4rem 0.6rem'
    }
  }, t.telepathy.acceptBtn), React.createElement("button", {
    "data-test": "btn-rifiuta",
    onClick: declineInvite,
    className: "btn-secondary",
    style: {
      flex: 1,
      fontSize: '0.85rem',
      padding: '0.4rem 0.6rem'
    }
  }, t.telepathy.declineBtn)), React.createElement("button", {
    "data-test": "btn-blocca-da-invito",
    onClick: () => setConfermaBlocco({
      nome: incomingInvite.from_name,
      p_invite_id: incomingInvite.invite_id
    }),
    className: "text-white text-xs",
    style: {
      marginTop: '0.5rem',
      opacity: 0.85,
      textDecoration: 'underline',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0
    }
  }, testoInviti('blocca'))), incomingInvite && partner && !sessionEnded && !partnerDisconnected && React.createElement("div", {
    "data-test": "invito-durante-training",
    className: "invite-toast-training",
    style: {
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      width: 'min(320px, calc(100vw - 2rem))',
      background: 'rgba(30,27,75,0.95)',
      border: '1px solid rgba(167,139,250,0.5)',
      borderRadius: '0.85rem',
      padding: '0.75rem 1rem',
      zIndex: 9999
    }
  }, React.createElement("p", {
    className: "text-white",
    style: {
      fontSize: '0.85rem',
      margin: '0 0 0.5rem 0'
    }
  }, testoInviti('invito_durante_training', {
    nome: incomingInvite.from_name
  })), React.createElement("button", {
    "data-test": "btn-rifiuta",
    onClick: declineInvite,
    className: "btn-secondary",
    style: {
      fontSize: '0.8rem',
      padding: '0.3rem 0.75rem'
    }
  }, testoInviti('rifiuta'))), attesaInvitante && partner && !sessionEnded && React.createElement("div", {
    "data-test": "attesa-invitante",
    role: "status",
    style: {
      position: 'fixed',
      top: '1rem',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(360px, calc(100vw - 2rem))',
      background: 'rgba(30,27,75,0.95)',
      border: '1px solid rgba(167,139,250,0.5)',
      borderRadius: '0.85rem',
      padding: '0.75rem 1rem',
      zIndex: 9998,
      textAlign: 'center'
    }
  }, React.createElement("p", {
    className: "text-white",
    style: {
      fontSize: '0.9rem',
      margin: 0
    }
  }, testoInviti('attesa_invitante', {
    nome: attesaInvitante.nome,
    tempo: IH && !isNaN(Date.parse(attesaInvitante.respondedAt)) ? IH.mmss(IH.secondiRimasti(new Date(Date.parse(attesaInvitante.respondedAt) + 180000).toISOString(), scartoOrologio, adessoLocale)) : ''
  }))), partner && !sessionEnded && !partnerDisconnected && isTabHidden && React.createElement("div", {
    className: "training-floating-banner",
    onClick: () => setActiveTab('telepathy'),
    style: {
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      maxWidth: 'min(320px, calc(100vw - 2rem))',
      background: 'linear-gradient(135deg, rgba(124,58,237,0.95) 0%, rgba(167,139,250,0.92) 100%)',
      border: '1px solid rgba(255,255,255,0.25)',
      boxShadow: '0 12px 40px rgba(124,58,237,0.5), 0 0 24px rgba(167,139,250,0.4)',
      borderRadius: '0.85rem',
      padding: '0.85rem 1rem',
      zIndex: 9998,
      cursor: 'pointer',
      animation: 'training-banner-slide-up 0.35s ease-out'
    },
    title: t.telepathy.trainingFloatingCta
  }, React.createElement("p", {
    className: "text-white",
    style: {
      margin: 0,
      fontSize: '0.9rem',
      lineHeight: 1.35
    }
  }, "\uD83D\uDD2E ", t.telepathy.trainingFloatingPrefix, " ", React.createElement("strong", null, partner.nickname), " \u2014 ", t.telepathy.trainingFloatingCta)), roleSwapOverlay && React.createElement("div", {
    className: "role-swap-overlay",
    onClick: () => setRoleSwapOverlay(null)
  }, React.createElement("div", {
    className: "role-swap-card"
  }, React.createElement("p", {
    className: "role-swap-text"
  }, roleSwapOverlay === 'sender' ? t.telepathy.roleSwappedSender : t.telepathy.roleSwappedReceiver))), showEndSessionConfirm && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setShowEndSessionConfirm(false)
  }, React.createElement("div", {
    className: "modal-content",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: '400px'
    }
  }, React.createElement("h3", {
    className: "text-white font-bold mb-2",
    style: {
      fontSize: '1.1rem'
    }
  }, t.telepathy.endSessionConfirmTitle), React.createElement("p", {
    className: "text-secondary mb-4",
    style: {
      fontSize: '0.9rem'
    }
  }, t.telepathy.endSessionConfirmBody), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.5rem',
      justifyContent: 'flex-end'
    }
  }, React.createElement("button", {
    onClick: () => setShowEndSessionConfirm(false),
    className: "btn-secondary"
  }, t.telepathy.endSessionConfirmNo), React.createElement("button", {
    onClick: () => {
      setShowEndSessionConfirm(false);
      endSession();
    },
    className: "btn-primary"
  }, t.telepathy.endSessionConfirmYes)))), showLogoutConfirm && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setShowLogoutConfirm(false)
  }, React.createElement("div", {
    className: "modal-content",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: '400px'
    }
  }, React.createElement("h3", {
    className: "text-white font-bold mb-2",
    style: {
      fontSize: '1.1rem'
    }
  }, t.logoutConfirmTitle), React.createElement("p", {
    className: "text-secondary mb-4",
    style: {
      fontSize: '0.9rem'
    }
  }, t.logoutConfirmBody), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.5rem',
      justifyContent: 'flex-end'
    }
  }, React.createElement("button", {
    onClick: () => setShowLogoutConfirm(false),
    className: "btn-secondary"
  }, t.logoutConfirmNo), React.createElement("button", {
    onClick: () => {
      setShowLogoutConfirm(false);
      handleLogout();
    },
    className: "btn-primary"
  }, t.logoutConfirmYes)))), renderIosInstallModal(), showDeleteAccount && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => !gdprBusy && setShowDeleteAccount(false),
    style: {
      zIndex: 60
    }
  }, React.createElement("div", {
    className: "modal-content",
    onClick: e => e.stopPropagation(),
    style: {
      maxWidth: '26rem'
    }
  }, React.createElement("h3", {
    className: "text-xl font-bold text-white mb-2"
  }, t.gdprDeleteTitle), React.createElement("p", {
    className: "text-secondary text-sm mb-4"
  }, t.gdprDeleteBody), React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.gdprDeleteConfirmLabel), React.createElement("input", {
    type: "text",
    value: deleteConfirmText,
    onChange: e => setDeleteConfirmText(e.target.value),
    placeholder: nickname,
    style: {
      marginBottom: '1rem'
    }
  }), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.5rem'
    }
  }, React.createElement("button", {
    className: "btn-secondary",
    style: {
      flex: 1
    },
    disabled: gdprBusy,
    onClick: () => setShowDeleteAccount(false)
  }, t.gdprDeleteCancel), React.createElement("button", {
    style: {
      flex: 1,
      padding: '0.6rem',
      borderRadius: '0.75rem',
      border: 'none',
      background: '#dc2626',
      color: '#fff',
      fontWeight: 700,
      cursor: deleteConfirmText === nickname && !gdprBusy ? 'pointer' : 'not-allowed',
      opacity: deleteConfirmText === nickname && !gdprBusy ? 1 : 0.5
    },
    disabled: deleteConfirmText !== nickname || gdprBusy,
    onClick: confirmDeleteAccount
  }, gdprBusy ? t.gdprDeleting : t.gdprDeleteConfirmBtn)))), showCreateRitual && React.createElement("div", {
    className: "modal-overlay",
    onClick: () => setShowCreateRitual(false)
  }, React.createElement("div", {
    className: "modal-content",
    onClick: e => e.stopPropagation()
  }, React.createElement("h2", {
    className: "text-2xl font-bold text-white mb-6"
  }, t.rituals.modalTitle), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }
  }, React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.ritualName), React.createElement("input", {
    type: "text",
    value: newRitual.name,
    onChange: e => setNewRitual({
      ...newRitual,
      name: e.target.value
    }),
    placeholder: "e.g., Full Moon Meditation",
    maxLength: 80
  })), React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.description), React.createElement("textarea", {
    value: newRitual.description,
    onChange: e => setNewRitual({
      ...newRitual,
      description: e.target.value
    }),
    placeholder: "Describe the ritual...",
    rows: "5",
    maxLength: 5000
  }), 5000 - newRitual.description.length < 500 && React.createElement("div", {
    className: "text-xs text-secondary"
  }, t.rituals.descCounter(5000 - newRitual.description.length))), React.createElement("div", {
    className: "grid grid-cols-2 gap-4"
  }, React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.type), React.createElement("select", {
    value: newRitual.type,
    onChange: e => setNewRitual({
      ...newRitual,
      type: e.target.value
    })
  }, ritualTypes.map(type => React.createElement("option", {
    key: type.id,
    value: type.id
  }, type.icon, " ", type.name)))), React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.sacredNumber), React.createElement("select", {
    value: newRitual.sacredNumber,
    onChange: e => setNewRitual({
      ...newRitual,
      sacredNumber: parseInt(e.target.value)
    })
  }, sacredNumbers.map(num => React.createElement("option", {
    key: num,
    value: num
  }, num))))), React.createElement("div", {
    className: "grid grid-cols-2 gap-4"
  }, React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.date), React.createElement("input", {
    type: "date",
    value: newRitual.date,
    onChange: e => setNewRitual({
      ...newRitual,
      date: e.target.value
    })
  })), React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.time), React.createElement("input", {
    type: "time",
    value: newRitual.time,
    onChange: e => setNewRitual({
      ...newRitual,
      time: e.target.value
    })
  }))), React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.duration), React.createElement("input", {
    type: "number",
    value: newRitual.duration,
    onChange: e => setNewRitual({
      ...newRitual,
      duration: parseInt(e.target.value)
    }),
    min: "1",
    max: newRitual.ripeti === 'mai' ? 180 : 720
  })), React.createElement("div", null, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.repeat), React.createElement("select", {
    "data-test": "repeat-select",
    value: newRitual.ripeti,
    onChange: e => setNewRitual({
      ...newRitual,
      ripeti: e.target.value
    })
  }, React.createElement("option", {
    value: "mai"
  }, t.rituals.repeatNever), React.createElement("option", {
    value: "ogni"
  }, t.rituals.repeatDaily), React.createElement("option", {
    value: "giorni"
  }, t.rituals.repeatDays)), newRitual.ripeti === 'giorni' && React.createElement("div", {
    className: "flex gap-1",
    style: {
      marginTop: '0.5rem',
      flexWrap: 'wrap'
    }
  }, [1, 2, 3, 4, 5, 6, 7].map(n => {
    const attivo = (newRitual.giorni || []).includes(n);
    return React.createElement("button", {
      key: n,
      type: "button",
      "data-test": `repeat-day-${n}`,
      "aria-pressed": attivo,
      onClick: () => setNewRitual({
        ...newRitual,
        giorni: attivo ? newRitual.giorni.filter(g => g !== n) : [...(newRitual.giorni || []), n].sort((a, b) => a - b)
      }),
      className: attivo ? 'btn-primary' : 'btn-secondary',
      style: {
        padding: '0.4rem 0.6rem',
        fontSize: '0.8rem',
        minHeight: '40px'
      }
    }, t.rituals.weekdaysShort[n - 1]);
  })), newRitual.ripeti !== 'mai' && React.createElement("div", {
    style: {
      marginTop: '0.5rem'
    }
  }, React.createElement("label", {
    className: "text-white text-sm mb-2",
    style: {
      display: 'block'
    }
  }, t.rituals.until), React.createElement("input", {
    type: "date",
    "data-test": "repeat-until",
    value: newRitual.fino || '',
    min: newRitual.date,
    onChange: e => setNewRitual({
      ...newRitual,
      fino: e.target.value
    })
  }))), React.createElement("div", {
    className: "grid grid-cols-2 gap-4 mt-4"
  }, React.createElement("button", {
    onClick: () => setShowCreateRitual(false),
    className: "btn-secondary w-full"
  }, t.rituals.cancel), React.createElement("button", {
    onClick: createRitual,
    className: "btn-primary w-full",
    disabled: savingContent
  }, savingContent ? '…' : t.rituals.create))))), React.createElement("audio", {
    ref: musicRef,
    src: MUSIC_SRC,
    loop: true,
    preload: "none"
  }), stanza && stanzaLive && React.createElement("div", {
    "data-test": "ritual-room",
    role: "dialog",
    "aria-label": t.rituals.room,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 9990,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2rem 1.25rem',
      gap: '1rem',
      overflowY: 'auto',
      background: 'rgba(10, 6, 30, 0.94)',
      backdropFilter: 'blur(6px)'
    }
  }, React.createElement("button", {
    "data-test": "room-close",
    onClick: () => setStanzaId(null),
    className: "btn-secondary",
    style: {
      alignSelf: 'flex-end'
    }
  }, t.rituals.closeRoom), React.createElement("div", {
    style: {
      fontSize: '3rem'
    }
  }, ritualTypes.find(x => x.id === stanza.type)?.icon), React.createElement("h2", {
    className: "text-white",
    style: {
      fontSize: '1.6rem',
      fontWeight: 700,
      textAlign: 'center'
    }
  }, stanza.name), React.createElement("div", {
    "data-test": "room-people",
    style: {
      color: '#4ade80'
    }
  }, presentiStanza != null ? t.rituals.peopleHere(presentiStanza) : ''), stanza.description && React.createElement("div", {
    "data-test": "room-text",
    className: "text-white",
    style: {
      whiteSpace: 'pre-wrap',
      fontSize: '1.35rem',
      lineHeight: 1.6,
      maxWidth: '40rem',
      textAlign: 'center'
    }
  }, stanza.description), React.createElement("div", {
    style: {
      display: 'flex',
      gap: '0.75rem'
    }
  }, React.createElement("button", {
    "data-test": "room-candle",
    onClick: () => toggleCandle(stanza.id),
    className: "btn-secondary px-4",
    "aria-pressed": candelaMiaStanza,
    "aria-label": candelaMiaStanza ? t.rituals.candleExtinguish : t.rituals.candleLight,
    title: candelaMiaStanza ? t.rituals.candleExtinguish : t.rituals.candleLight,
    style: candelaMiaStanza ? {
      border: '1px solid rgba(251,191,36,0.7)',
      background: 'rgba(251,191,36,0.18)'
    } : undefined
  }, "\uD83D\uDD6F\uFE0F ", (stanza.candles || []).length), React.createElement("button", {
    "data-test": "room-music",
    onClick: () => {
      if (Date.now() - sbloccoMusicaRef.current < 1000) return;
      toggleMusic();
    },
    className: "btn-secondary px-4",
    title: musicaInAttesaDiGesto ? t.musicTap : undefined,
    "aria-label": musicaInAttesaDiGesto ? t.musicTap : musicMuted ? t.musicUnmute : t.musicMute
  }, musicMuted ? '🔇' : musicaInAttesaDiGesto ? '🔈' : '🔊')), nomiCandeleStanza.length > 0 && React.createElement("div", {
    "data-test": "room-candle-names",
    style: {
      color: 'rgba(251,191,36,0.9)',
      textAlign: 'center',
      maxWidth: '40rem'
    }
  }, t.rituals.candlesLitBy, ": ", nomiCandeleStanza.join(', '))), sogliaAperta && ritualeLive && React.createElement("div", {
    "data-test": "soglia-rituale",
    role: "button",
    tabIndex: 0,
    "aria-label": t.rituals.thresholdTap,
    onClick: () => {
      if (!musicaInAttesaDiGesto || tocchiSogliaRef.current++ >= 1) setSogliaAperta(false);
    },
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      padding: '2rem',
      textAlign: 'center',
      cursor: 'pointer',
      background: 'rgba(10, 6, 30, 0.88)',
      backdropFilter: 'blur(6px)',
      animation: 'rso-fade 0.4s ease-out'
    }
  }, React.createElement("div", {
    style: {
      fontSize: '3.5rem',
      animation: 'pulse-glow 2.5s ease-in-out infinite',
      borderRadius: '50%'
    }
  }, "\u2728"), React.createElement("div", {
    className: "text-white",
    style: {
      fontSize: '1.5rem',
      fontWeight: 600
    }
  }, ritualeLive.name), React.createElement("div", {
    style: {
      color: '#c4b5fd',
      fontSize: '1.15rem'
    }
  }, t.rituals.thresholdTap), React.createElement("div", {
    style: {
      color: '#a78bfa',
      fontSize: '0.85rem',
      opacity: 0.8
    }
  }, t.rituals.thresholdHint)), renderFooter(), renderPrivacyModal());
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(GlobalAwakeningPlatform));