
        const { useState, useEffect, useRef, useCallback } = React;

        // Supabase is initialized in the script tag above

        // Hash legacy (SHA-256 semplice). Mantenuto SOLO per il login (26_): il browser lo manda
        // come p_legacy_hash a login_with_password, che lo usa esclusivamente per riconoscere e
        // migrare gli account non ancora passati a PBKDF2. Non usarlo più per memorizzare nuove
        // password: usare deriveStrongHash.
        async function hashPassword(password) {
          const encoder = new TextEncoder();
          const data = encoder.encode(password);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // C1: hash robusto PBKDF2-SHA256 con salt (16 byte) e 100k iterazioni.
        // Formato autodescrittivo: "pbkdf2$<iter>$<saltB64>$<hashB64>".
        // Per un nuovo hash: salt random. Per il login (26_): passare salt+iter ricevuti da
        // get_login_params (ricostruisce la stessa stringa se la password combacia; la verifica
        // avviene lato server in login_with_password).
        async function deriveStrongHash(password, saltBytes, iterations) {
          const enc = new TextEncoder();
          const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
          const iter = iterations || 100000;
          const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
          const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, keyMaterial, 256);
          const b64 = (arr) => btoa(String.fromCharCode.apply(null, new Uint8Array(arr)));
          return `pbkdf2$${iter}$${b64(salt)}$${b64(bits)}`;
        }

        // Validazione formato email lato client (A8): blocca submit con email malformate.
        function isValidEmail(email) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }

        // Le colonne pubbliche di profiles. Email e hash non si leggono da qui: arrivano solo
        // dalle RPC di login, a chi ha la password.
        const PUBLIC_PROFILE_COLUMNS = 'session_id,nickname,bio,starseed_type,avatar,country,interests,experience_level,telepathy_score,telepathy_best,show_telepathy_score';

        const Star = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>;
        const Brain = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"></path></svg>;
        const Send = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>;
        const Calendar = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
        const Users = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;

        // Campo password con l'occhietto: tocchi e vedi cosa hai scritto. Sta fuori dal componente
        // principale perché, ridefinito a ogni render, React lo ricreerebbe e il campo perderebbe il
        // fuoco a ogni lettera. `mostra`/`nascondi` sono le etichette per i lettori di schermo.
        const PasswordInput = ({ mostra, nascondi, wrapperStyle, style, ...props }) => {
          const [visibile, setVisibile] = React.useState(false);
          return (
            <div style={{position: 'relative', width: '100%', ...wrapperStyle}}>
              <input {...props} type={visibile ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{...style, paddingRight: '3rem'}} />
              <button
                type="button"
                onClick={() => setVisibile(v => !v)}
                aria-label={visibile ? nascondi : mostra}
                title={visibile ? nascondi : mostra}
                style={{position: 'absolute', right: '0.25rem', top: '50%', transform: 'translateY(-50%)', width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#c4b5fd', cursor: 'pointer', padding: 0}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle>
                  {visibile && <line x1="3" y1="3" x2="21" y2="21"></line>}
                </svg>
              </button>
            </div>
          );
        };

        const telepathySymbols = [
          { id: 'star', icon: '⭐', name: 'Star' },
          { id: 'sun', name: 'Sun', icon: (
            <svg viewBox="0 0 24 24" style={{width: '1em', height: '1em', verticalAlign: 'middle'}} aria-hidden="true">
              <circle cx="12" cy="12" r="5" fill="#fcd34d" />
              <g stroke="#fcd34d" strokeWidth="2.2" strokeLinecap="round">
                <line x1="12" y1="1.5" x2="12" y2="4.2" /><line x1="12" y1="19.8" x2="12" y2="22.5" />
                <line x1="1.5" y1="12" x2="4.2" y2="12" /><line x1="19.8" y1="12" x2="22.5" y2="12" />
                <line x1="4.4" y1="4.4" x2="6.3" y2="6.3" /><line x1="17.7" y1="17.7" x2="19.6" y2="19.6" />
                <line x1="4.4" y1="19.6" x2="6.3" y2="17.7" /><line x1="17.7" y1="6.3" x2="19.6" y2="4.4" />
              </g>
            </svg>
          ) },
          { id: 'moon', icon: '🌙', name: 'Moon' },
          { id: 'heart', icon: '💜', name: 'Heart' },
          { id: 'eye', icon: '👁️', name: 'Eye' },
          // ∞ è un carattere di testo (come numeri e lettere), non un'emoji: il colore chiaro
          // che lo rende leggibile è impostato via CSS su .symbol-btn e sullo span del recap
          // (un solo punto per tutti i glifi-testo). Le emoji ignorano `color`, restano invariate.
          { id: 'infinity', icon: '∞', name: 'Infinity' },
          { id: 'water', icon: '💧', name: 'Water' },
          { id: 'fire', icon: '🔥', name: 'Fire' },
          { id: 'crystalball', icon: '🔮', name: 'Crystal Ball' }
        ];

        const telepathyNumbers = [
          { id: 'n1', icon: '1', name: '1' },
          { id: 'n2', icon: '2', name: '2' },
          { id: 'n3', icon: '3', name: '3' },
          { id: 'n4', icon: '4', name: '4' },
          { id: 'n5', icon: '5', name: '5' },
          { id: 'n6', icon: '6', name: '6' },
          { id: 'n7', icon: '7', name: '7' },
          { id: 'n8', icon: '8', name: '8' },
          { id: 'n9', icon: '9', name: '9' },
        ];

        // Livello "Lettere": mostra lettere (non più emoji). icon = la lettera (render testuale, come i numeri).
        const telepathyWords = [
          { id: 'A', icon: 'A', name: 'A' },
          { id: 'B', icon: 'B', name: 'B' },
          { id: 'C', icon: 'C', name: 'C' },
          { id: 'D', icon: 'D', name: 'D' },
          { id: 'E', icon: 'E', name: 'E' },
          { id: 'F', icon: 'F', name: 'F' },
        ];

        // Codice ospite leggibile e stabile (es. 'aurora-lince-4827'): identità anonima ma
        // RICONOSCIBILE per l'indagine telepatia. Sostituisce il sessionId illeggibile come
        // identità del percipiente nei telepathy_trials; consente un eventuale appello pubblico
        // ("cerchiamo aurora-lince-4827") a cui la persona può rispondere spontaneamente. Spec Fase 3.
        // Spazio ~20×20×9000 ≈ 3,6M combinazioni: collisioni improbabili alla scala realistica
        // dell'app (a migliaia di ospiti il rischio cresce — limite accettato, non un'identità
        // crittografica). matchId è univoco (id DB), quindi nessuna perdita dati sul vincolo UNIQUE.
        const GUEST_ADJ = ['aurora', 'lunare', 'solare', 'stellare', 'cosmico', 'astrale', 'etereo', 'mistico', 'radioso', 'sereno', 'profondo', 'arcano', 'celeste', 'lucente', 'eterno', 'sacro', 'antico', 'divino', 'nebuloso', 'boreale'];
        const GUEST_ANIMAL = ['lince', 'cervo', 'lupo', 'falco', 'gufo', 'volpe', 'airone', 'delfino', 'cigno', 'pantera', 'colibri', 'fenice', 'aquila', 'leone', 'tigre', 'orca', 'corvo', 'ibis', 'drago', 'gazzella'];
        const makeGuestCode = () => {
          const pick = (a) => a[Math.floor(Math.random() * a.length)];
          return `${pick(GUEST_ADJ)}-${pick(GUEST_ANIMAL)}-${1000 + Math.floor(Math.random() * 9000)}`;
        };

        const ritualTypes = [
          { id: 'consciousness', name: 'Consciousness Elevation', icon: '🧠' },
          { id: 'dna', name: 'DNA Activation', icon: '🧬' },
          { id: 'lightbody', name: 'Light Body Activation', icon: '✨' },
          { id: 'unity', name: 'Unity Consciousness', icon: '🤝' },
          { id: 'ascension', name: 'Ascension Portal', icon: '🌅' }
        ];

        const sacredNumbers = [1, 3, 7, 9, 11, 22, 33, 44, 108];

        // ==== TRADUZIONI: INIZIO ====
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
            registrationFailed: "Registration failed. Please try again.",
            fillNameDateTime: "Please fill in name, date and time.",
            noNotifications: "No notifications",
            go: "Go",
            ok: "OK",
            seeOnlineUsers: "See online users (Community)",
            mainSections: "Main sections",
            worldMapAlt: "World map",
            password: "Password",
            newPasswordPh: "New password...",
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
            sessionExpired: "For your security, please sign in again: we'll email you a link. Your profile, messages and scores are safe.",
            showPassword: "Show password",
            hidePassword: "Hide password",
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
            tabs: { rituals: "Rituals", telepathy: "Telepathy", consciousness: "Consciousness" },
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
              repeat: "Repeats", repeatNever: "Just once", repeatDaily: "Every day", repeatDays: "Chosen days",
              until: "Until", weekdaysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
              everyDay: "Every day", whenAt: (quando, ora) => `${quando} at ${ora}`, dayOf: (n, m) => `day ${n} of ${m}`,
              namePh: "e.g., Full Moon Meditation", descPh: "Describe the ritual...",
              types: { consciousness: "Consciousness Elevation", dna: "DNA Activation", lightbody: "Light Body Activation", unity: "Unity Consciousness", ascension: "Ascension Portal" },
              leave: "Leave", leaveFailed: "Could not leave the ritual.",
              stop: "Stop", stopTitle: "Stop the cycle?",
              stopBody: "The cycle stops: there will be no more sessions. The current one, if any, ends normally.",
              stopYes: "Stop", stopNo: "Let it continue", stopFailed: "Could not stop the cycle.",
              reloginNeeded: "To continue, please sign in again: use “Forgot password?” to choose a new password.",
              room: "Ritual room", peopleHere: (n) => n === 1 ? "1 person here now" : `${n} people here now`,
              closeRoom: "Close", enterRoom: "Enter", descCounter: (n) => `${n} characters left`,
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
              testRitual: "⚡ Test (3 min)",
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
              sections: [
                { heading: "What we collect", body: "When you create an account: your email, a password (stored only as a cryptographic hash, never in plain text), and the nickname, short bio and country you choose to share. As you use the app we store your activity: telepathy scores, private messages, rituals, posts and comments, and your online status. Your browser also keeps your nickname and preferences in local storage. We do not use cookies, analytics or any external trackers." },
                { heading: "Why we use it", body: "Only to make the app work: signing you in, powering the telepathy, rituals and community features, and showing in-app notifications. We never sell your data or use it for advertising." },
                { heading: "Where it lives", body: "Your data is stored on Supabase (our database). Transactional emails (password reset and magic link) are sent through EmailJS. The site is hosted on GitHub Pages. We share data with these providers only as needed to run the service." },
                { heading: "How long we keep it", body: "Account and activity data are kept while your account is active. Password-reset and magic-link tokens expire within 15 minutes." },
                { heading: "Your rights", body: "Under the GDPR you can access, correct, delete or export your data, or object to its use. Export and account deletion are available self-service from your profile (open your profile → \"Your data (GDPR)\"). For correction or objection, open an issue on our public GitHub repository (github.com/global-awakening/global-awakening.github.io)." },
                { heading: "Security", body: "Data is stored on Supabase and passwords are kept hashed, never in plain text. As a small personal project we cannot guarantee enterprise-grade security — please don't share anything you wouldn't want others to potentially see." },
                { heading: "Changes", body: "The version shown here is always the current one. If anything important changes, we'll update this page." }
              ],
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
              waiting: (n) => `${n} ${n > 1 ? "starseeds" : "starseed"} waiting`,
              cancel: "Cancel",
              partnerLeftSuffix: "ended the session",
              yourPartnerFallback: "Your partner",
              backToLobby: "Back to lobby",
              differentChoices: "Different choices — continuing with",
              levelShapes: "Symbols", levelShapesN: (n) => `${n} Symbols`,
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
              partnerOfflineN: (nick) => `${nick} is no longer online — go back to the lobby and pick another partner.`,
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
            registrationFailed: "Registrazione non riuscita. Riprova.",
            fillNameDateTime: "Compila nome, data e ora.",
            noNotifications: "Nessuna notifica",
            go: "Vai",
            ok: "OK",
            seeOnlineUsers: "Vedi gli utenti online (Community)",
            mainSections: "Sezioni principali",
            worldMapAlt: "Mappa del mondo",
            password: "Password",
            newPasswordPh: "Nuova password...",
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
            sessionExpired: "Per sicurezza devi rientrare: ti mandiamo un link via email. Profilo, messaggi e punteggi sono al sicuro.",
            showPassword: "Mostra password",
            hidePassword: "Nascondi password",
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
            tabs: { rituals: "Rituali", telepathy: "Telepatia", consciousness: "Coscienza" },
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
              repeat: "Si ripete", repeatNever: "Una volta sola", repeatDaily: "Ogni giorno", repeatDays: "Giorni scelti",
              until: "Fino al", weekdaysShort: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"],
              everyDay: "Ogni giorno", whenAt: (quando, ora) => `${quando} alle ${ora}`, dayOf: (n, m) => `giorno ${n} di ${m}`,
              namePh: "es. Meditazione della Luna Piena", descPh: "Descrivi il rituale...",
              types: { consciousness: "Elevazione della Coscienza", dna: "Attivazione del DNA", lightbody: "Attivazione del Corpo di Luce", unity: "Coscienza di Unità", ascension: "Portale dell'Ascensione" },
              leave: "Lascia", leaveFailed: "Non è stato possibile lasciare il rituale.",
              stop: "Ferma", stopTitle: "Fermare il ciclo?",
              stopBody: "Il ciclo si ferma: non ci saranno altri appuntamenti. Quello in corso, se c'è, finisce normalmente.",
              stopYes: "Ferma", stopNo: "Lascialo andare", stopFailed: "Non è stato possibile fermare il ciclo.",
              reloginNeeded: "Per continuare accedi di nuovo: usa «Password dimenticata?» per scegliere una nuova password.",
              room: "Stanza del rituale", peopleHere: (n) => n === 1 ? "1 persona qui adesso" : `${n} persone qui adesso`,
              closeRoom: "Chiudi", enterRoom: "Entra", descCounter: (n) => `ancora ${n} caratteri`,
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
              testRitual: "⚡ Prova (3 min)",
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
              sections: [
                { heading: "Quali dati raccogliamo", body: "Quando crei un account: la tua email, una password (memorizzata solo come hash crittografico, mai in chiaro) e il nickname, la breve bio e il paese che scegli di condividere. Mentre usi l'app salviamo la tua attività: punteggi della telepatia, messaggi privati, rituali, post e commenti, e il tuo stato online. Il browser conserva inoltre nickname e preferenze nel local storage. Non usiamo cookie, analytics né tracker esterni." },
                { heading: "Perché li usiamo", body: "Solo per far funzionare l'app: accesso, funzionalità di telepatia, rituali e community, e notifiche all'interno dell'app. Non vendiamo mai i tuoi dati né li usiamo per pubblicità." },
                { heading: "Dove sono conservati", body: "I tuoi dati sono conservati su Supabase (il nostro database). Le email transazionali (reset password e magic link) vengono inviate tramite EmailJS. Il sito è ospitato su GitHub Pages. Condividiamo i dati con questi fornitori solo per quanto necessario a far funzionare il servizio." },
                { heading: "Per quanto tempo li conserviamo", body: "I dati dell'account e di attività restano finché il tuo account è attivo. I token di reset password e magic link scadono entro 15 minuti." },
                { heading: "I tuoi diritti", body: "In base al GDPR puoi accedere, rettificare, cancellare o esportare i tuoi dati, oppure opporti al loro utilizzo. Export ed eliminazione dell'account sono disponibili in autonomia dal tuo profilo (apri il profilo → \"I tuoi dati (GDPR)\"). Per rettifica o opposizione, apri una issue sul nostro repository GitHub pubblico (github.com/global-awakening/global-awakening.github.io)." },
                { heading: "Sicurezza", body: "I dati sono conservati su Supabase e le password sono salvate sotto forma di hash, mai in chiaro. Trattandosi di un piccolo progetto personale non possiamo garantire una sicurezza di livello aziendale: ti invitiamo a non condividere nulla che non vorresti potesse essere visto da altri." },
                { heading: "Modifiche", body: "La versione mostrata qui è sempre quella attuale. Se qualcosa di importante cambia, aggiorneremo questa pagina." }
              ],
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
              waiting: (n) => `${n} starseed in attesa`,
              cancel: "Annulla",
              partnerLeftSuffix: "ha terminato la sessione",
              yourPartnerFallback: "Il tuo partner",
              backToLobby: "Torna alla lobby",
              differentChoices: "Scelte diverse — si continua con",
              levelShapes: "Simboli", levelShapesN: (n) => `${n} Simboli`,
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
              partnerOfflineN: (nick) => `${nick} non e' piu' online — torna alla lobby e scegli un altro partner.`,
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
          },
          es: {
            title: "Global Awakening",
            subtitle: "Unidos en la Luz, Despiertos como Uno",
            enterPlatform: "Entrar",
            enterAsGuest: "Entrar como Invitado",
            login: "Iniciar sesión",
            register: "Registrarse",
            passwordOptional: "Contraseña (opcional)",
            emailPlaceholder: "Correo electrónico",
            usernamePlaceholder: "Elige un nombre de usuario...",
            invalidCredentials: "Correo o contraseña incorrectos",
            tooManyAttempts: "Demasiados intentos, vuelve a intentarlo en unos minutos",
            emailAlreadyUsed: "Este correo ya está registrado",
            usernameAlreadyUsed: "Este nombre de usuario ya está en uso",
            fillAllFields: "Completa todos los campos",
            invalidEmail: "Ingresa un correo electrónico válido",
            connectionError: "Problema de conexión. Revisa la red y vuelve a intentarlo.",
            reportIssue: "Reportar un problema",
            pwaInstall: "📲 Instalar app",
            pwaIosTitle: "Instalar en iPhone",
            pwaIosBody: "Toca Compartir ⬆️ y luego \"Añadir a pantalla de inicio\".",
            pwaIosClose: "Entendido",
            musicCredit: "Música de",
            musicFrom: "en",
            musicMute: "Silenciar la música",
            musicUnmute: "Activar la música",
            musicTap: "Toca la pantalla para que empiece la música",
            pwaIosBrowserTitle: "Abrir en Safari",
            pwaIosBrowserBody: "Desde aquí no se puede instalar la app. Toca «•••» arriba a la derecha, elige «Abrir en Safari» y vuelve a intentarlo.",
            pwaBannerText: "Lleva Global Awakening en tu teléfono",
            pwaBannerClose: "Cerrar",
            setPassword: "Crear Contraseña",
            changePassword: "Cambiar Contraseña",
            passwordSet: "¡Contraseña guardada!",
            profileSaveFailed: "No se pudo guardar el perfil. Vuelve a entrar e inténtalo de nuevo.",
            passwordChangeFailed: "No se pudo cambiar la contraseña. Vuelve a entrar e inténtalo de nuevo.",
            registrationFailed: "No se pudo completar el registro. Inténtalo de nuevo.",
            fillNameDateTime: "Completa el nombre, la fecha y la hora.",
            noNotifications: "No hay notificaciones",
            go: "Ir",
            ok: "OK",
            seeOnlineUsers: "Ver quién está en línea (Comunidad)",
            mainSections: "Secciones principales",
            worldMapAlt: "Mapa del mundo",
            password: "Contraseña",
            newPasswordPh: "Nueva contraseña...",
            newAccountCreated: "¡Cuenta creada! ¡Te damos la bienvenida!",
            tabGuest: "Invitado",
            tabLogin: "Entrar",
            tabRegister: "Registrarse",
            noAccountYet: "¿No tienes cuenta? Regístrate",
            alreadyHaveAccount: "¿Ya tienes cuenta? Inicia sesión",
            forgotPassword: "¿Olvidaste la contraseña?",
            resetPassword: "Restablecer Contraseña",
            backToLogin: "Volver al inicio de sesión",
            newPasswordPlaceholder: "Nueva contraseña",
            confirmPasswordPlaceholder: "Confirma la nueva contraseña",
            passwordsNoMatch: "Las contraseñas no coinciden",
            resetEmailSent: "Si la dirección está registrada, te hemos escrito. Haz clic en el enlace del correo.",
            resetTokenInvalid: "Enlace no válido o vencido. Pide uno nuevo.",
            resetSuccess: "¡Contraseña actualizada! Ya puedes iniciar sesión.",
            setNewPassword: "Crear nueva contraseña",
            magicLinkSent: "Si la dirección está registrada, te hemos enviado un enlace para entrar.",
            magicLinkInvalid: "Enlace no válido o vencido. Pide uno nuevo.",
            sendMagicLink: "Enviar enlace de acceso",
            magicLinkHint: "Entrar con enlace mágico →",
            sessionExpired: "Por seguridad tienes que volver a entrar: te enviamos un enlace por correo. Tu perfil, tus mensajes y tus puntuaciones están a salvo.",
            showPassword: "Mostrar contraseña",
            hidePassword: "Ocultar contraseña",
            guestBadge: "Invitado",
            registeredBadge: "Registrado",
            guestCodeLabel: "Tu código de investigador",
            guestCodeHint: "Anónimo pero reconocible (guardado en este dispositivo): si obtienes resultados de telepatía excepcionales, podríamos hacer un llamamiento público con este código para que puedas darte a conocer, solo si tú quieres.",
            registerInvite: "Regístrate para guardar tu perfil para siempre",
            logout: "Salir",
            logoutConfirmTitle: "¿Quieres salir?",
            logoutConfirmBody: "Volverás a la pantalla de acceso.",
            logoutConfirmYes: "Salir",
            logoutConfirmNo: "Cancelar",
            gdprTitle: "Tus datos (RGPD)",
            gdprExport: "Exportar mis datos",
            gdprExporting: "Preparando…",
            gdprDelete: "Eliminar cuenta",
            gdprDeleteTitle: "¿Quieres eliminar la cuenta?",
            gdprDeleteBody: "Esto elimina para siempre tu perfil, tus mensajes privados y tus puntuaciones. Tus publicaciones y comentarios públicos se mantienen, pero aparecerán como \"Utente eliminato\". No se puede deshacer.",
            gdprDeleteConfirmLabel: "Escribe tu nickname para confirmar:",
            gdprDeleteConfirmBtn: "Eliminar para siempre",
            gdprDeleteCancel: "Cancelar",
            gdprDeleting: "Eliminando…",
            gdprExportError: "No se pudo exportar. Inténtalo de nuevo.",
            gdprDeleteError: "No se pudo eliminar. Inténtalo de nuevo.",
            tabs: { rituals: "Rituales", telepathy: "Telepatía", consciousness: "Consciencia" },
            showTelepathyScore: "Mostrar puntuación de telepatía",
            pushChiedi: "¿Quieres que te avise cuando empiece?",
            pushSi: "Sí, avísame",
            pushNo: "Ahora no",
            pushImpostazioni: "Avísame cuando empiece un ritual",
            pushIosInstalla: "Para recibir notificaciones, primero añade la app a la pantalla de inicio.",
            editProfile: "Editar Perfil",
            profile: {
              title: "Tu Perfil",
              subtitle: "Háblale de ti a la comunidad",
              bio: "Bio",
              bioPlaceholder: "Cuéntanos tu camino espiritual...",
              starseedType: "Tipo de Starseed",
              avatar: "Avatar",
              country: "País (opcional)",
              countryPlaceholder: "Tu país",
              interests: "Intereses Espirituales",
              experienceLevel: "Nivel de Experiencia",
              save: "Guardar Perfil",
              saved: "¡Perfil Guardado!",
              starseedTypes: {
                pleiadian: "Pleyadiano",
                sirian: "Siriano",
                arcturian: "Arcturiano",
                andromedan: "Andromedano",
                lyran: "Lirano",
                orion: "Orión",
                universal: "Universal"
              },
              experienceLevels: {
                beginner: "Principiante",
                intermediate: "Intermedio",
                advanced: "Avanzado",
                master: "Maestro"
              },
              interestsList: {
                meditation: "Meditación",
                telepathy: "Telepatía",
                healing: "Sanación",
                astrology: "Astrología",
                lucidDreams: "Sueños Lúcidos",
                astralProjection: "Proyección Astral",
                channeling: "Canalización"
              }
            },
            rituals: {
              title: "Rituales Globales",
              repeat: "Se repite", repeatNever: "Solo una vez", repeatDaily: "Todos los días", repeatDays: "Días elegidos",
              until: "Hasta el", weekdaysShort: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
              // «a la 1:00» ma «a las 21:00»: in spagnolo l'articolo segue l'ora.
              everyDay: "Todos los días", whenAt: (quando, ora) => `${quando} ${/^0?1:/.test(ora) ? 'a la' : 'a las'} ${ora}`, dayOf: (n, m) => `día ${n} de ${m}`,
              namePh: "p. ej. Meditación de Luna Llena", descPh: "Describe el ritual...",
              types: { consciousness: "Elevación de la Consciencia", dna: "Activación del ADN", lightbody: "Activación del Cuerpo de Luz", unity: "Consciencia de Unidad", ascension: "Portal de la Ascensión" },
              leave: "Salir", leaveFailed: "No se pudo salir del ritual.",
              stop: "Detener", stopTitle: "¿Detener el ciclo?",
              stopBody: "El ciclo se detiene: no habrá más encuentros. El que está en curso, si lo hay, termina con normalidad.",
              stopYes: "Detener", stopNo: "Déjalo seguir", stopFailed: "No se pudo detener el ciclo.",
              reloginNeeded: "Para continuar, vuelve a iniciar sesión: usa «¿Olvidaste la contraseña?» para elegir una nueva.",
              room: "Sala del ritual", peopleHere: (n) => n === 1 ? "1 persona aquí ahora" : `${n} personas aquí ahora`,
              closeRoom: "Cerrar", enterRoom: "Entrar", descCounter: (n) => `quedan ${n} caracteres`,
              recurrenceErrors: {
                recurrence_incomplete: "Elige los días y la fecha de fin.",
                recurrence_days_invalid: "Elige al menos un día de la semana.",
                recurrence_end_invalid: "La fecha de fin debe ser posterior al inicio, como máximo dentro de un año.",
                recurrence_duration_too_long: "Un ritual que se repite dura como máximo 12 horas.",
                recurrence_empty: "En este periodo no cae ninguno de los días elegidos.",
                recurrence_limit: "Ya tienes 10 rituales que se repiten: detén uno antes de crear otro.",
                timezone_invalid: "No se reconoce la zona horaria del teléfono."
              },
              subtitle: "Ceremonias de despertar sincronizadas",
              deleteRitual: "Eliminar",
              deleteTitle: "¿Eliminar este ritual?",
              deleteBody: "Desaparece para todos los que se hayan unido. Solo se puede hacer antes de que empiece.",
              deleteYes: "Eliminar",
              deleteNo: "Mantenerlo",
              deleteStarted: "Demasiado tarde: el ritual ya ha empezado.",
              thresholdTap: "Toca para entrar en el ritual",
              thresholdHint: "La música empezará cuando toques la pantalla",
              deleteFailed: "No se pudo eliminar el ritual.",
              createRitual: "Proponer Ritual",
              testRitual: "⚡ Prueba (3 min)",
              noRituals: "Todavía no hay rituales. ¡Sé el primero en proponer uno!",
              participants: "participantes",
              startsIn: "Empieza en",
              live: "EN VIVO",
              ended: "Terminado",
              join: "Unirme",
              joined: "Unido",
              sendEnergy: "Enviar Energía",
              candleLight: "Enciende una vela",
              candleExtinguish: "Apaga tu vela",
              candlesLitBy: "Velas encendidas por",
              candleNotLive: "La vela se enciende durante el ritual.",
              candleNotPresent: "Entra en la sala para encender la vela.",
              candleTooMany: "La sala está llena de velas.",
              modalTitle: "Crear Ritual",
              ritualName: "Nombre del Ritual",
              description: "Descripción",
              type: "Tipo",
              sacredNumber: "Número Sagrado",
              date: "Fecha",
              time: "Hora",
              duration: "Duración (minutos)",
              create: "Crear Ritual",
              cancel: "Cancelar"
            },
            feed: {
              title: "Feed de Consciencia",
              subtitle: "Comparte tus pensamientos con la comunidad",
              newPostPlaceholder: "¿Qué tienes en mente? Comparte tu despertar...",
              post: "Publicar",
              comment: "Comentar",
              comments: "comentarios",
              addComment: "Añade un comentario...",
              noFeed: "Todavía no hay publicaciones. ¡Sé el primero en compartir!",
              showComments: "Mostrar comentarios",
              hideComments: "Ocultar comentarios"
            },
            map: {
              title: "Red Global",
              subtitle: "Starseeds que despiertan juntos",
              visible: "starseeds visibles"
            },
            social: {
              viewProfile: "Ver Perfil",
              telepathyScore: "Rondas Jugadas",
              bestScore: "% Aciertos",
              community: "Comunidad",
              noProfile: "Todavía no hay perfil",
              close: "Cerrar",
              notifications: "Notificaciones"
            },
            stats: {
              activeRituals: "Rituales Activos",
              roundsPlayed: "Rondas Jugadas",
              onlineNow: "En línea ahora"
            },
            privacy: {
              linkLabel: "Privacidad",
              title: "Política de privacidad",
              lastUpdated: "Última actualización: junio de 2026",
              intro: "Global Awakening es un proyecto personal y no comercial. Esta página explica, con palabras sencillas, qué datos tratamos y por qué.",
              sections: [
                { heading: "Qué datos recogemos", body: "Cuando creas una cuenta: tu correo electrónico, una contraseña (guardada solo como hash criptográfico, nunca en texto plano) y el nickname, la breve bio y el país que decidas compartir. Mientras usas la app guardamos tu actividad: puntuaciones de telepatía, mensajes privados, rituales, publicaciones y comentarios, y tu estado en línea. Además, el navegador guarda tu nickname y tus preferencias en el local storage. No usamos cookies, analítica ni rastreadores externos." },
                { heading: "Para qué los usamos", body: "Solo para que la app funcione: acceso, funciones de telepatía, rituales y comunidad, y notificaciones dentro de la app. Nunca vendemos tus datos ni los usamos para publicidad." },
                { heading: "Dónde se guardan", body: "Tus datos se guardan en Supabase (nuestra base de datos). Los correos transaccionales (restablecimiento de contraseña y enlace mágico) se envían a través de EmailJS. El sitio está alojado en GitHub Pages. Compartimos datos con estos proveedores solo en la medida necesaria para que el servicio funcione." },
                { heading: "Cuánto tiempo los conservamos", body: "Los datos de la cuenta y de actividad se conservan mientras tu cuenta esté activa. Los tokens de restablecimiento de contraseña y de enlace mágico caducan en un máximo de 15 minutos." },
                { heading: "Tus derechos", body: "Según el RGPD puedes acceder a tus datos, rectificarlos, suprimirlos o exportarlos, o bien oponerte a su uso. Puedes exportar tus datos y eliminar tu cuenta directamente desde tu perfil (abre el perfil → \"Tus datos (RGPD)\"). Para la rectificación o la oposición, abre una issue en nuestro repositorio público de GitHub (github.com/global-awakening/global-awakening.github.io)." },
                { heading: "Seguridad", body: "Los datos se guardan en Supabase y las contraseñas se almacenan en forma de hash, nunca en texto plano. Al tratarse de un pequeño proyecto personal, no podemos garantizar una seguridad de nivel empresarial: te invitamos a no compartir nada que no quieras que puedan ver otras personas." },
                { heading: "Cambios", body: "La versión que se muestra aquí es siempre la vigente. Si cambia algo importante, actualizaremos esta página." }
              ],
              close: "Cerrar"
            },
            messages: {
              title: "Mensajes",
              subtitle: "Conversaciones privadas",
              noConversations: "Todavía no hay conversaciones. ¡Visita un perfil y envía un mensaje!",
              guestPrompt: "Regístrate para enviar mensajes privados",
              receiverNotRegistered: "Este starseed todavía no está registrado, así que no puede recibir mensajes privados. ¡Invítalo a registrarse!",
              placeholder: "Escribe un mensaje...",
              send: "Enviar",
              sendMessage: "Enviar Mensaje",
              newMessage: "Nuevo mensaje para",
              messagePlaceholder: "Escribe tu primer mensaje...",
              back: "Atrás",
              you: "Tú"
            },
            telepathy: {
              title: "Entrenamiento Telepático",
              subtitle: "Desarrolla tus capacidades psíquicas",
              howItWorks: "Cómo funciona:",
              step1: "1. Elige un compañero de la lista o busca uno al azar",
              step2: "2. Uno envía un símbolo, el otro lo recibe",
              step3: "3. ¡Después de 7 rondas puedes cambiar el tipo de juego!",
              onlineUsers: "Usuarios en línea",
              inSession: "en sesión",
              available: "disponible",
              propose: "Invitar",
              inviteSent: "Invitación enviada...",
              randomMatch: "Compañero al Azar",
              searching: "Buscando un compañero...",
              queuePosition: "Posición en la cola",
              waiting: (n) => `${n} ${n === 1 ? "starseed" : "starseeds"} esperando`,
              cancel: "Cancelar",
              partnerLeftSuffix: "ha terminado la sesión",
              yourPartnerFallback: "Tu compañero",
              backToLobby: "Volver al inicio",
              differentChoices: "Opciones distintas — se sigue con",
              levelShapes: "Símbolos", levelShapesN: (n) => `${n} Símbolos`,
              levelNumbers: "Números",
              levelWords: "Letras",
              you: "Tú",
              partner: "Compañero",
              ok: "Ok",
              yourRole: "Tu papel",
              roleSwappedSender: "🔄 ¡Papeles invertidos! Ahora eres el Emisor",
              roleSwappedReceiver: "🔄 ¡Papeles invertidos! Ahora eres el Receptor",
              roleSender: "Emisor",
              roleReceiver: "Receptor",
              roundLabel: "Ronda",
              matchLabel: "Aciertos",
              levelLabel: "Nivel",
              accuracyLabel: "Precisión",
              statusLabel: "Estado",
              changeLevelPrompt: "¿Quieres cambiar el tipo de telepatía?",
              youChose: "Elegiste",
              waitingDots: "Esperando...",
              continueLevel: "Continuar",
              levelChooseTitle: "Elige la nueva modalidad",
              levelKeep: "Seguir igual",
              levelWaiting: "está eligiendo la nueva modalidad de juego…",
              tabPlay: "Jugar",
              tabLeaderboard: "Clasificación",
              leaderboardTitle: "Mejores telépatas",
              leaderboardEmpty: "Todavía hay pocos datos: juega para aparecer aquí.",
              leaderboardPlayer: "Jugador",
              leaderboardMatches: "Aciertos",
              leaderboardAccuracy: "Precisión",
              leaderboardRefresh: "Actualizar",
              pickSymbol: "Elige el símbolo que vas a enviar:",
              sendTelepathically: "Enviar Telepáticamente",
              symbolSentGuess: "✨ ¡Símbolo enviado! ¿Cuál recibes?",
              waitingForSend: "está eligiendo el símbolo… espera a que se ilumine",
              confirm: "Confirmar",
              senderWaiting: "¡Símbolo enviado! Esperando a que el receptor adivine...",
              receiverWaiting: "¡Respuesta enviada! Esperando al emisor...",
              matchResult: "✨ ¡CONEXIÓN TELEPÁTICA! ✨",
              noMatch: "Esta vez no. ¡Sigue adelante!",
              sentLabel: "Enviado",
              guessedLabel: "Adivinado",
              resonance: "Sintonía ✨",
              again: "Otra vez",
              nextMatchIn: "Nueva ronda en",
              endSessionBtn: "Terminar Sesión",
              endSessionConfirmTitle: "¿Salir de la sesión?",
              endSessionConfirmBody: "Tu compañero recibirá un aviso. No se puede deshacer.",
              endSessionConfirmYes: "Salir",
              endSessionConfirmNo: "Quedarme",
              sessionComplete: "¡Sesión Completada!",
              roundsPlayed: "Rondas jugadas",
              correctMatches: "Aciertos",
              accuracyColon: "Precisión:",
              playAgainWith: "Otra sesión con",
              backToLobbyCap: "Volver al Inicio",
              leaveSession: "Salir de la sesión",
              chatWith: "Chat con",
              noMessages: "Todavía no hay mensajes",
              chatPlaceholder: "Escribe...",
              statusChoosingLevel: "Esperando la elección del nivel...",
              statusRoundDone: "¡Ronda completada!",
              statusGuessing: "está adivinando...",
              statusWaitingSymbol: "espera tu símbolo",
              statusWaitingResult: "Esperando el resultado...",
              statusSent: "¡ha enviado! Adivina.",
              statusChoosing: "está eligiendo...",
              partnerOfflineN: (nick) => `${nick} ya no está en línea: vuelve al inicio y elige otro compañero.`,
              inviteModalTitle: "Invitación al Entrenamiento Telepático",
              inviteModalBody: "¡quiere hacer entrenamiento telepático contigo!",
              acceptBtn: "Aceptar",
              declineBtn: "Rechazar",
              inviteExpired: "Vencida",
              trainingFloatingPrefix: "Entrenamiento en curso con",
              trainingFloatingCta: "Volver"
            },
            moderation: {
              menu: "Acciones",
              report: "Reportar",
              block: "Bloquear",
              unblock: "Desbloquear",
              cancel: "Cancelar",
              blockedUsers: "Usuarios bloqueados",
              noBlocked: "No has bloqueado a nadie.",
              blockTitle: "¿Quieres bloquear a esta persona?",
              blockConfirm: "Ya no verás su contenido y no podrá escribirte. Puedes deshacerlo cuando quieras.",
              blockDone: "Usuario bloqueado.",
              unblockDone: "Usuario desbloqueado.",
              reportTitle: "Reportar contenido",
              reportWhy: "¿Por qué lo reportas?",
              reportNotes: "Notas (opcionales)",
              reportSend: "Enviar reporte",
              reportDone: "Reporte enviado. Lo revisaremos en un plazo de 48 horas.",
              reportRules: "Normas de contenido",
              guestOnly: "Necesitas una cuenta registrada para reportar o bloquear.",
              reasons: {
                spam: "Spam o publicidad",
                harassment: "Acoso o insultos",
                hate: "Odio o discriminación",
                sexual: "Contenido sexual",
                violence: "Violencia o amenazas",
                self_harm: "Autolesiones o suicidio",
                other: "Otro"
              }
            }
          },
          fr: {
            title: "Global Awakening",
            subtitle: "Unis dans la Lumière, Éveillés, ne faisant qu'Un",
            enterPlatform: "Entrer",
            enterAsGuest: "Entrer en tant qu'Invité",
            login: "Se connecter",
            register: "S'inscrire",
            passwordOptional: "Mot de passe (facultatif)",
            emailPlaceholder: "Adresse e-mail",
            usernamePlaceholder: "Choisis un nom d'utilisateur...",
            invalidCredentials: "E-mail ou mot de passe incorrect",
            tooManyAttempts: "Trop de tentatives, réessaie dans quelques minutes",
            emailAlreadyUsed: "Cette adresse e-mail est déjà utilisée",
            usernameAlreadyUsed: "Ce nom d'utilisateur est déjà pris",
            fillAllFields: "Remplis tous les champs",
            invalidEmail: "Saisis une adresse e-mail valide",
            connectionError: "Problème de connexion. Vérifie ton réseau et réessaie.",
            reportIssue: "Signaler un problème",
            pwaInstall: "📲 Installer l'app",
            pwaIosTitle: "Installer sur iPhone",
            pwaIosBody: "Touche Partager ⬆️ puis « Sur l'écran d'accueil ».",
            pwaIosClose: "J'ai compris",
            musicCredit: "Musique de",
            musicFrom: "sur",
            musicMute: "Couper la musique",
            musicUnmute: "Remettre la musique",
            musicTap: "Touche l'écran pour lancer la musique",
            pwaIosBrowserTitle: "Ouvrir dans Safari",
            pwaIosBrowserBody: "L'app ne peut pas s'installer depuis ici. Touche « ••• » en haut à droite, choisis « Ouvrir dans Safari » et réessaie.",
            pwaBannerText: "Garde Global Awakening sur ton téléphone",
            pwaBannerClose: "Fermer",
            setPassword: "Définir un Mot de passe",
            changePassword: "Changer de Mot de passe",
            passwordSet: "Mot de passe enregistré !",
            profileSaveFailed: "Impossible d'enregistrer le profil. Reconnecte-toi et réessaie.",
            passwordChangeFailed: "Impossible de changer le mot de passe. Reconnecte-toi et réessaie.",
            registrationFailed: "L'inscription n'a pas abouti. Réessaie.",
            fillNameDateTime: "Remplis le nom, la date et l'heure.",
            noNotifications: "Aucune notification",
            go: "Aller",
            ok: "OK",
            seeOnlineUsers: "Voir qui est en ligne (Communauté)",
            mainSections: "Sections principales",
            worldMapAlt: "Carte du monde",
            password: "Mot de passe",
            newPasswordPh: "Nouveau mot de passe...",
            newAccountCreated: "Compte créé ! Bienvenue !",
            tabGuest: "Invité",
            tabLogin: "Connexion",
            tabRegister: "Inscription",
            noAccountYet: "Pas encore de compte ? Inscris-toi",
            alreadyHaveAccount: "Tu as déjà un compte ? Connecte-toi",
            forgotPassword: "Mot de passe oublié ?",
            resetPassword: "Réinitialiser le Mot de passe",
            backToLogin: "Retour à la connexion",
            newPasswordPlaceholder: "Nouveau mot de passe",
            confirmPasswordPlaceholder: "Confirme le nouveau mot de passe",
            passwordsNoMatch: "Les mots de passe ne correspondent pas",
            resetEmailSent: "Si l'adresse est inscrite, nous t'avons écrit. Clique sur le lien dans l'e-mail.",
            resetTokenInvalid: "Lien invalide ou expiré. Demandes-en un nouveau.",
            resetSuccess: "Mot de passe mis à jour ! Tu peux maintenant te connecter.",
            setNewPassword: "Définir un nouveau mot de passe",
            magicLinkSent: "Si l'adresse est inscrite, nous t'avons envoyé un lien pour te connecter.",
            magicLinkInvalid: "Lien invalide ou expiré. Demandes-en un nouveau.",
            sendMagicLink: "Envoyer le lien de connexion",
            magicLinkHint: "Connexion par lien magique →",
            sessionExpired: "Par sécurité, tu dois te reconnecter : nous t'envoyons un lien par e-mail. Ton profil, tes messages et tes scores sont en sécurité.",
            showPassword: "Afficher le mot de passe",
            hidePassword: "Masquer le mot de passe",
            guestBadge: "Invité",
            registeredBadge: "Inscrit",
            guestCodeLabel: "Ton code de chercheur",
            guestCodeHint: "Anonyme mais reconnaissable (enregistré sur cet appareil) : si tu obtiens des résultats de télépathie exceptionnels, nous pourrions lancer un appel public pour ce code, afin que tu puisses te faire connaître — seulement si tu le souhaites.",
            registerInvite: "Inscris-toi pour garder ton profil pour toujours",
            logout: "Quitter",
            logoutConfirmTitle: "Tu veux te déconnecter ?",
            logoutConfirmBody: "Tu reviendras à l'écran de connexion.",
            logoutConfirmYes: "Se déconnecter",
            logoutConfirmNo: "Annuler",
            gdprTitle: "Tes données (RGPD)",
            gdprExport: "Exporter mes données",
            gdprExporting: "Préparation…",
            gdprDelete: "Supprimer le compte",
            gdprDeleteTitle: "Tu veux supprimer ton compte ?",
            gdprDeleteBody: "Cela supprime définitivement ton profil, tes messages privés et tes scores. Tes publications et commentaires publics restent, mais apparaîtront sous le nom « Utente eliminato ». Cette action est irréversible.",
            gdprDeleteConfirmLabel: "Tape ton pseudo pour confirmer :",
            gdprDeleteConfirmBtn: "Supprimer pour toujours",
            gdprDeleteCancel: "Annuler",
            gdprDeleting: "Suppression…",
            gdprExportError: "L'export n'a pas abouti. Réessaie.",
            gdprDeleteError: "La suppression n'a pas abouti. Réessaie.",
            tabs: { rituals: "Rituels", telepathy: "Télépathie", consciousness: "Conscience" },
            showTelepathyScore: "Afficher le score de télépathie",
            pushChiedi: "Tu veux que je te prévienne quand ça commence ?",
            pushSi: "Oui, préviens-moi",
            pushNo: "Pas maintenant",
            pushImpostazioni: "Préviens-moi quand un rituel commence",
            pushIosInstalla: "Pour recevoir les notifications, ajoute d'abord l'app à l'écran d'accueil.",
            editProfile: "Modifier le Profil",
            profile: {
              title: "Ton Profil",
              subtitle: "Parle de toi à la communauté",
              bio: "Bio",
              bioPlaceholder: "Raconte-nous ton chemin spirituel...",
              starseedType: "Type de Starseed",
              avatar: "Avatar",
              country: "Pays (facultatif)",
              countryPlaceholder: "Ton pays",
              interests: "Centres d'intérêt spirituels",
              experienceLevel: "Niveau d'Expérience",
              save: "Enregistrer le Profil",
              saved: "Profil Enregistré !",
              starseedTypes: {
                pleiadian: "Pléiadien",
                sirian: "Sirien",
                arcturian: "Arcturien",
                andromedan: "Andromédien",
                lyran: "Lyrien",
                orion: "Orion",
                universal: "Universel"
              },
              experienceLevels: {
                beginner: "Débutant",
                intermediate: "Intermédiaire",
                advanced: "Avancé",
                master: "Maître"
              },
              interestsList: {
                meditation: "Méditation",
                telepathy: "Télépathie",
                healing: "Guérison",
                astrology: "Astrologie",
                lucidDreams: "Rêves Lucides",
                astralProjection: "Projection Astrale",
                channeling: "Channeling"
              }
            },
            rituals: {
              title: "Rituels Mondiaux",
              repeat: "Se répète", repeatNever: "Une seule fois", repeatDaily: "Tous les jours", repeatDays: "Jours choisis",
              until: "Jusqu'au", weekdaysShort: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
              everyDay: "Tous les jours", whenAt: (quando, ora) => `${quando} à ${ora}`, dayOf: (n, m) => `jour ${n} sur ${m}`,
              namePh: "Ex. : Méditation de la Pleine Lune", descPh: "Décris le rituel...",
              types: { consciousness: "Élévation de la Conscience", dna: "Activation de l'ADN", lightbody: "Activation du Corps de Lumière", unity: "Conscience de l'Unité", ascension: "Portail de l'Ascension" },
              leave: "Quitter", leaveFailed: "Impossible de quitter le rituel.",
              stop: "Arrêter", stopTitle: "Arrêter le cycle ?",
              stopBody: "Le cycle s'arrête : il n'y aura plus de rendez-vous. Celui en cours, s'il y en a un, se termine normalement.",
              stopYes: "Arrêter", stopNo: "Laisse-le continuer", stopFailed: "Impossible d'arrêter le cycle.",
              reloginNeeded: "Pour continuer, reconnecte-toi : utilise « Mot de passe oublié ? » pour choisir un nouveau mot de passe.",
              // In francese 0 e 1 vogliono il singolare.
              room: "Salle du rituel", peopleHere: (n) => n <= 1 ? `${n} personne ici maintenant` : `${n} personnes ici maintenant`,
              closeRoom: "Fermer", enterRoom: "Entrer", descCounter: (n) => `encore ${n} caractères`,
              recurrenceErrors: {
                recurrence_incomplete: "Choisis les jours et la date de fin.",
                recurrence_days_invalid: "Choisis au moins un jour de la semaine.",
                recurrence_end_invalid: "La date de fin doit être après le début, au maximum dans un an.",
                recurrence_duration_too_long: "Un rituel qui se répète dure au maximum 12 heures.",
                recurrence_empty: "Aucun des jours choisis ne tombe dans cette période.",
                recurrence_limit: "Tu as déjà 10 rituels qui se répètent : arrêtes-en un avant d'en créer un autre.",
                timezone_invalid: "Le fuseau horaire du téléphone n'est pas reconnu."
              },
              subtitle: "Cérémonies d'éveil synchronisées",
              deleteRitual: "Supprimer",
              deleteTitle: "Supprimer ce rituel ?",
              deleteBody: "Il disparaît pour tous ceux qui l'ont rejoint. Possible seulement avant qu'il commence.",
              deleteYes: "Supprimer",
              deleteNo: "Le garder",
              deleteStarted: "Trop tard : le rituel a déjà commencé.",
              thresholdTap: "Touche pour entrer dans le rituel",
              thresholdHint: "La musique démarrera dès que tu toucheras l'écran",
              deleteFailed: "Impossible de supprimer le rituel.",
              createRitual: "Proposer un Rituel",
              testRitual: "⚡ Test (3 min)",
              noRituals: "Aucun rituel pour l'instant. Sois le premier à en proposer un !",
              participants: "participants",
              startsIn: "Commence dans",
              live: "EN DIRECT",
              ended: "Terminé",
              join: "Rejoindre",
              joined: "Tu participes",
              sendEnergy: "Envoyer de l'Énergie",
              candleLight: "Allume une bougie",
              candleExtinguish: "Éteins ta bougie",
              candlesLitBy: "Bougies allumées par",
              candleNotLive: "La bougie s'allume pendant le rituel.",
              candleNotPresent: "Entre dans la salle pour allumer la bougie.",
              candleTooMany: "La salle est pleine de bougies.",
              modalTitle: "Créer un Rituel",
              ritualName: "Nom du Rituel",
              description: "Description",
              type: "Type",
              sacredNumber: "Nombre Sacré",
              date: "Date",
              time: "Heure",
              duration: "Durée (minutes)",
              create: "Créer le Rituel",
              cancel: "Annuler"
            },
            feed: {
              title: "Fil de Conscience",
              subtitle: "Partage tes pensées avec la communauté",
              newPostPlaceholder: "À quoi penses-tu ? Partage ton éveil...",
              post: "Publier",
              comment: "Commenter",
              comments: "commentaires",
              addComment: "Ajoute un commentaire...",
              noFeed: "Aucune publication pour l'instant. Sois le premier à partager !",
              showComments: "Afficher les commentaires",
              hideComments: "Masquer les commentaires"
            },
            map: {
              title: "Réseau Mondial",
              subtitle: "Des starseeds qui s'éveillent ensemble",
              visible: "starseeds visibles"
            },
            social: {
              viewProfile: "Voir le Profil",
              telepathyScore: "Manches Jouées",
              bestScore: "% Réussite",
              community: "Communauté",
              noProfile: "Pas encore de profil",
              close: "Fermer",
              notifications: "Notifications"
            },
            stats: {
              activeRituals: "Rituels Actifs",
              roundsPlayed: "Manches Jouées",
              onlineNow: "En ligne"
            },
            privacy: {
              linkLabel: "Confidentialité",
              title: "Politique de confidentialité",
              lastUpdated: "Dernière mise à jour : juin 2026",
              intro: "Global Awakening est un projet personnel et non commercial. Cette page explique, avec des mots simples, quelles données nous traitons et pourquoi.",
              sections: [
                { heading: "Quelles données nous collectons", body: "Quand tu crées un compte : ton adresse e-mail, un mot de passe (enregistré uniquement sous forme de hash cryptographique, jamais en clair) ainsi que le pseudo, la courte bio et le pays que tu choisis de partager. Pendant que tu utilises l'app, nous enregistrons ton activité : scores de télépathie, messages privés, rituels, publications et commentaires, et ton statut en ligne. Ton navigateur conserve aussi ton pseudo et tes préférences dans le local storage. Nous n'utilisons ni cookies, ni outils d'analyse, ni traceurs externes." },
                { heading: "Pourquoi nous les utilisons", body: "Uniquement pour faire fonctionner l'app : connexion, fonctionnalités de télépathie, de rituels et de communauté, et notifications dans l'app. Nous ne vendons jamais tes données et ne les utilisons pas pour de la publicité." },
                { heading: "Où elles sont conservées", body: "Tes données sont conservées sur Supabase (notre base de données). Les e-mails transactionnels (réinitialisation du mot de passe et lien magique) sont envoyés via EmailJS. Le site est hébergé sur GitHub Pages. Nous ne partageons les données avec ces prestataires que dans la mesure nécessaire au fonctionnement du service." },
                { heading: "Combien de temps nous les conservons", body: "Les données du compte et d'activité sont conservées tant que ton compte est actif. Les jetons de réinitialisation du mot de passe et de lien magique expirent dans un délai de 15 minutes." },
                { heading: "Tes droits", body: "En vertu du RGPD, tu peux accéder à tes données, les rectifier, les effacer ou les exporter, ou t'opposer à leur utilisation. Tu peux exporter tes données et supprimer ton compte directement depuis ton profil (ouvre ton profil → « Tes données (RGPD) »). Pour une rectification ou une opposition, ouvre une issue sur notre dépôt GitHub public (github.com/global-awakening/global-awakening.github.io)." },
                { heading: "Sécurité", body: "Les données sont conservées sur Supabase et les mots de passe sont enregistrés sous forme de hash, jamais en clair. S'agissant d'un petit projet personnel, nous ne pouvons pas garantir une sécurité de niveau entreprise : nous t'invitons à ne rien partager que tu ne voudrais pas que d'autres puissent voir." },
                { heading: "Modifications", body: "La version affichée ici est toujours la version en vigueur. Si quelque chose d'important change, nous mettrons cette page à jour." }
              ],
              close: "Fermer"
            },
            messages: {
              title: "Messages",
              subtitle: "Conversations privées",
              noConversations: "Aucune conversation. Visite un profil et envoie un message !",
              guestPrompt: "Inscris-toi pour envoyer des messages privés",
              receiverNotRegistered: "Ce starseed n'est pas encore inscrit, il ne peut donc pas recevoir de messages privés. Invite-le à s'inscrire !",
              placeholder: "Écris un message...",
              send: "Envoyer",
              sendMessage: "Envoyer un Message",
              newMessage: "Nouveau message à",
              messagePlaceholder: "Écris ton premier message...",
              back: "Retour",
              you: "Toi"
            },
            telepathy: {
              title: "Entraînement Télépathique",
              subtitle: "Développe tes capacités psychiques",
              howItWorks: "Comment ça marche :",
              step1: "1. Choisis un partenaire dans la liste ou cherches-en un au hasard",
              step2: "2. L'un envoie un symbole, l'autre le reçoit",
              step3: "3. Après 7 manches, tu peux changer de type de jeu !",
              onlineUsers: "Utilisateurs en ligne",
              inSession: "en session",
              available: "disponible",
              propose: "Inviter",
              inviteSent: "Invitation envoyée...",
              randomMatch: "Partenaire au Hasard",
              searching: "Je cherche un partenaire...",
              queuePosition: "Position dans la file",
              waiting: (n) => `${n} ${n > 1 ? "starseeds" : "starseed"} en attente`,
              cancel: "Annuler",
              partnerLeftSuffix: "a mis fin à la session",
              yourPartnerFallback: "Ton partenaire",
              backToLobby: "Retour au salon",
              differentChoices: "Choix différents — on continue avec",
              levelShapes: "Symboles", levelShapesN: (n) => `${n} Symboles`,
              levelNumbers: "Nombres",
              levelWords: "Lettres",
              you: "Toi",
              partner: "Partenaire",
              ok: "Ok",
              yourRole: "Ton rôle",
              roleSwappedSender: "🔄 Rôles inversés ! Tu es maintenant l'Émetteur",
              roleSwappedReceiver: "🔄 Rôles inversés ! Tu es maintenant le Récepteur",
              roleSender: "Émetteur",
              roleReceiver: "Récepteur",
              roundLabel: "Manche",
              matchLabel: "Réussites",
              levelLabel: "Niveau",
              accuracyLabel: "Précision",
              statusLabel: "Statut",
              changeLevelPrompt: "Tu veux changer de type de télépathie ?",
              youChose: "Tu as choisi",
              waitingDots: "En attente...",
              continueLevel: "Continuer",
              levelChooseTitle: "Choisis le nouveau mode",
              levelKeep: "Garder ce mode",
              levelWaiting: "choisit le nouveau mode de jeu…",
              tabPlay: "Jouer",
              tabLeaderboard: "Classement",
              leaderboardTitle: "Meilleurs télépathes",
              leaderboardEmpty: "Encore peu de données — joue pour apparaître ici.",
              leaderboardPlayer: "Joueur",
              leaderboardMatches: "Réussites",
              leaderboardAccuracy: "Précision",
              leaderboardRefresh: "Actualiser",
              pickSymbol: "Choisis le symbole à envoyer :",
              sendTelepathically: "Envoyer par Télépathie",
              symbolSentGuess: "✨ Symbole envoyé ! Lequel reçois-tu ?",
              waitingForSend: "choisit le symbole… attends qu'il s'allume",
              confirm: "Confirmer",
              senderWaiting: "Symbole envoyé ! En attendant que le récepteur devine...",
              receiverWaiting: "Réponse envoyée ! En attente de l'émetteur...",
              matchResult: "✨ CONNEXION TÉLÉPATHIQUE ! ✨",
              noMatch: "Pas cette fois. Continue !",
              sentLabel: "Envoyé",
              guessedLabel: "Deviné",
              resonance: "Harmonie ✨",
              again: "Encore",
              nextMatchIn: "Nouvelle manche dans",
              endSessionBtn: "Terminer la Session",
              endSessionConfirmTitle: "Quitter la session ?",
              endSessionConfirmBody: "Ton partenaire sera prévenu. Impossible de revenir en arrière.",
              endSessionConfirmYes: "Quitter",
              endSessionConfirmNo: "Rester",
              sessionComplete: "Session Terminée !",
              roundsPlayed: "Manches jouées",
              correctMatches: "Réussites",
              accuracyColon: "Précision :",
              playAgainWith: "Nouvelle session avec",
              backToLobbyCap: "Retour au Salon",
              leaveSession: "Quitter la session",
              chatWith: "Chat avec",
              noMessages: "Aucun message pour l'instant",
              chatPlaceholder: "Écris...",
              statusChoosingLevel: "En attente du choix du niveau...",
              statusRoundDone: "Manche terminée !",
              statusGuessing: "devine...",
              statusWaitingSymbol: "attend ton symbole",
              statusWaitingResult: "En attente du résultat...",
              statusSent: "a envoyé ! Devine.",
              statusChoosing: "choisit...",
              partnerOfflineN: (nick) => `${nick} n'est plus en ligne — retourne au salon et choisis un autre partenaire.`,
              inviteModalTitle: "Invitation à l'Entraînement Télépathique",
              inviteModalBody: "veut faire un entraînement télépathique avec toi !",
              acceptBtn: "Accepter",
              declineBtn: "Refuser",
              inviteExpired: "Expirée",
              trainingFloatingPrefix: "Entraînement en cours avec",
              trainingFloatingCta: "Revenir"
            },
            moderation: {
              menu: "Actions",
              report: "Signaler",
              block: "Bloquer",
              unblock: "Débloquer",
              cancel: "Annuler",
              blockedUsers: "Utilisateurs bloqués",
              noBlocked: "Tu n'as bloqué personne.",
              blockTitle: "Tu veux bloquer cette personne ?",
              blockConfirm: "Tu ne verras plus ses contenus et elle ne pourra plus t'écrire. Tu peux annuler quand tu veux.",
              blockDone: "Utilisateur bloqué.",
              unblockDone: "Utilisateur débloqué.",
              reportTitle: "Signaler un contenu",
              reportWhy: "Pourquoi le signales-tu ?",
              reportNotes: "Notes (facultatives)",
              reportSend: "Envoyer le signalement",
              reportDone: "Signalement envoyé. Nous l'examinerons sous 48 heures.",
              reportRules: "Règles de contenu",
              guestOnly: "Il faut être inscrit pour signaler ou bloquer.",
              reasons: {
                spam: "Spam ou publicité",
                harassment: "Harcèlement ou insultes",
                hate: "Haine ou discrimination",
                sexual: "Contenu sexuel",
                violence: "Violence ou menaces",
                self_harm: "Automutilation ou suicide",
                other: "Autre"
              }
            }
          }
        };
        // ==== TRADUZIONI: FINE ====

        // Ogni lingua nasce dall'inglese più la sua traduzione: una chiave dimenticata mostra
        // l'inglese invece di rompere la pagina (spec lingue §3.1). Calcolato una volta sola.
        const TRADUZIONI = (() => {
          const LH = typeof window !== 'undefined' ? window.LingueHelpers : null;
          const r = {};
          ['en', 'it', 'es', 'fr'].forEach((l) => { r[l] = LH ? LH.fondi(translations.en, translations[l]) : (translations[l] || translations.en); });
          return r;
        })();

        // Durata proposta quando si crea un rituale. Tre minuti, non trenta: un rituale è
        // un'esperienza sincrona: quello che conta è esserci tutti nello stesso momento, non
        // restare mezz'ora. Mezz'ora, per chi prova l'app la prima volta, è soprattutto
        // un'attesa. Resta modificabile a mano nel modulo.
        //
        // Chi la cambia guardi anche `supabase/functions/notify-ritual-start/finestre.mjs`:
        // la notifica «sta iniziando ora» ha una rete di sicurezza che non deve durare più
        // del rituale, o arriva quando è già finito.
        const DURATA_RITUALE_PREDEFINITA = 3;

        function GlobalAwakeningPlatform() {
          const [lang, setLangStato] = useState(() => {
            const LH = window.LingueHelpers;
            if (!LH) return 'en';
            let salvata = null;
            try { salvata = LH.leggiLinguaSalvata(window.localStorage); } catch (e) {}
            const tel = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
            return LH.linguaIniziale(salvata, tel);
          });
          // window.localStorage solleva in alcuni browser: da qui il try.
          const setLang = (l) => { setLangStato(l); try { window.LingueHelpers && window.LingueHelpers.salvaLingua(window.localStorage, l); } catch (e) {} };
          // Lingua delle date: quella dell'app, non quella del telefono.
          const LOC = window.LingueHelpers ? window.LingueHelpers.locale(lang) : 'en-GB';
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
          // Tiene traccia dell'ultimo round_count processato per evitare doppio processing
          const lastProcessedRoundRef = React.useRef(-1);
          // Task A1: memorizza se le colonne ended_at/ended_by esistono su Supabase (migration
          // 14_ applicata). Finche' non e' applicata, evita di ritentare la select con quelle
          // colonne ad ogni poll (ogni 2s per tutta la sessione): raddoppierebbe le richieste
          // di checkPartnerLeft inutilmente. Ottimistico (true) finche' non si osserva un errore.
          const endedColumnsSupportedRef = React.useRef(true);
          const [isMatch, setIsMatch] = useState(false);
          const [matchId, setMatchId] = useState(null);
          const [matchUser1Id, setMatchUser1Id] = useState(null); // user1 del match = primo chooser (cambio-modalità a turni)
          const [leaderboard, setLeaderboard] = useState([]); // top 10 per match telepatici
          const [partnerSymbol, setPartnerSymbol] = useState(null);

          // Telepatia v2 — nuovi state
          const [incomingInvite, setIncomingInvite] = useState(null); // { from_id, from_name, invite_id }
          const [directInviteTarget, setDirectInviteTarget] = useState(null); // utente a cui abbiamo inviato invito
          // Inviti a un training anche a chi non è collegato (spec 2026-09-25 §4.4). Lo stato vero
          // lo decide il server: qui c'è solo l'ultima risposta delle RPC.
          const [invitoInUscita, setInvitoInUscita] = useState(null);   // in_uscita di get_my_telepathy_invites
          const [scartoOrologio, setScartoOrologio] = useState(0);      // ora del server − ora del telefono, in ms
          const [adessoLocale, setAdessoLocale] = useState(Date.now()); // ticchettio dei conti alla rovescia
          const [avvisoInviti, setAvvisoInviti] = useState(null);       // messaggio da mostrare (motivi delle RPC)
          const [attesaInvitante, setAttesaInvitante] = useState(null); // { invitoId, respondedAt, nome } per chi ha accettato
          const [giroInviti, setGiroInviti] = useState(0);              // +1 = rileggi subito (push arrivata in primo piano)
          const [currentLevel, setCurrentLevel] = useState('lvl3'); // scala: 'lvl3'|'lvl5'|'lvl7'|'lvl9' + modalità extra 'numbers'|'words'
          const [roundCount, setRoundCount] = useState(0);
          const swapRole = (r) => r === 'sender' ? 'receiver' : 'sender';
          // round 0-based: 0,1,2 -> base; 3,4,5 -> swap; ... (alternanza ogni 3 round)
          const roleForRound = (baseRole, round) =>
            (Math.floor(round / 3) % 2 === 0) ? baseRole : swapRole(baseRole);
          const effectiveRole = role ? roleForRound(role, roundCount) : role;
          const [sessionMatches, setSessionMatches] = useState(0);
          const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
          const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
          const [showPrivacy, setShowPrivacy] = useState(false);
          const [deferredPrompt, setDeferredPrompt] = useState(null);
          const [showIosInstall, setShowIosInstall] = useState(false);
          // La chiusura del banner è per telefono, non per account: vive in localStorage.
          const [installBannerDismissed, setInstallBannerDismissed] = useState(() => {
            try { return localStorage.getItem('ga_install_banner_dismissed') === '1'; } catch { return false; }
          });
          const dismissInstallBanner = () => {
            setInstallBannerDismissed(true);
            try { localStorage.setItem('ga_install_banner_dismissed', '1'); } catch { /* Safari privato: pazienza */ }
          };
          const isStandalone = (typeof window !== 'undefined') &&
            (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
          const isIos = (typeof navigator !== 'undefined') && /iphone|ipad|ipod/i.test(navigator.userAgent);
          // Browser interni dei social: lì il menù Condividi non ha "Aggiungi alla schermata
          // Home", quindi le istruzioni normali sarebbero ineseguibili. L'unica cosa utile da
          // dire è di riaprire il link in Safari.
          const isInAppBrowser = (typeof navigator !== 'undefined') &&
            /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedIn|Pinterest|WhatsApp/i
              .test(navigator.userAgent);
          useEffect(() => {
            const onBip = (e) => { e.preventDefault(); setDeferredPrompt(e); };
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
          // Ref aggiornata per leggere il valore corrente dentro pollResult
          // senza dover ricreare l'effect ad ogni round (e quindi perdere fino a 2s di polling).
          const sessionMatchesRef = React.useRef(0);
          React.useEffect(() => { sessionMatchesRef.current = sessionMatches; }, [sessionMatches]);
          const [showLevelBanner, setShowLevelBanner] = useState(false);
          const [sessionEnded, setSessionEnded] = useState(false); // mostra schermata fine sessione
          const [partnerDisconnected, setPartnerDisconnected] = useState(false); // partner ha chiuso il tab
          const [onlineUsersForTelepathy, setOnlineUsersForTelepathy] = useState([]); // utenti con status
          const [senderHasSent, setSenderHasSent] = useState(false);
          // Riepilogo round: "congelo" ruolo+livello del round risolto, perché roundCount
          // incrementa al risultato e effectiveRole si INVERTE ogni 3 round → leggere il
          // ruolo live nel recap mostrava il simbolo sbagliato/nullo (bug "icona vuota").
          const [resultRole, setResultRole] = useState(null);
          const [resultLevel, setResultLevel] = useState(null);
          // Overlay centrale "ruoli invertiti" (auto-dismiss); chat sessione richiudibile su mobile.
          const [roleSwapOverlay, setRoleSwapOverlay] = useState(null); // null | 'sender' | 'receiver'
          const [telepathyChatOpen, setTelepathyChatOpen] = useState(false);
          const [telepathyChatMessages, setTelepathyChatMessages] = useState([]);
          const [newTelepathyMessage, setNewTelepathyMessage] = useState('');
          // Batch C #3 — tab nascosto (utente passato a altro tab del browser)
          const [isTabHidden, setIsTabHidden] = useState(typeof document !== 'undefined' && document.hidden);

          useEffect(() => {
            const onVisChange = () => setIsTabHidden(document.hidden);
            document.addEventListener('visibilitychange', onVisChange);
            return () => document.removeEventListener('visibilitychange', onVisChange);
          }, []);

          // Scala di difficoltà per numero di card: i livelli 'lvlN' mostrano le prime N
          // forme del set unico (es. 'lvl3' = 3 simboli, 'lvl9' = tutte e 9). Più card =
          // caso puro più improbabile (1/N). Numeri/Lettere restano modalità a parte.
          // getCurrentSymbols accetta anche il legacy 'shapes' (set intero) per sicurezza
          // se un partner sincronizza un valore vecchio.
          // cardCountForLevel = N (numero di card del livello): registrato per ogni tentativo
          // nell'indagine (prob. caso = 1/N).
          const cardCountForLevel = (level) => {
            if (level === 'numbers') return telepathyNumbers.length;
            if (level === 'words') return telepathyWords.length;
            const m = /^lvl(\d+)$/.exec(level || '');
            return m ? parseInt(m[1], 10) : telepathySymbols.length;
          };
          const getCurrentSymbols = (level) => {
            if (level === 'numbers') return telepathyNumbers;
            if (level === 'words') return telepathyWords;
            const m = /^lvl(\d+)$/.exec(level || '');
            return m ? telepathySymbols.slice(0, parseInt(m[1], 10)) : telepathySymbols;
          };

          // Classifica telepatia: top 10 per match telepatici totali, via RPC pubblica
          // (SECURITY DEFINER) — non legge più telepathy_scores direttamente.
          const loadLeaderboard = async () => {
            const { data } = await supabase.rpc('get_telepathy_leaderboard', { p_limit: 10 });
            setLeaderboard(Array.isArray(data) ? data : []);
          };
          // La classifica è in fondo alla lobby (sempre visibile): caricala all'ingresso in lobby telepatia.
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
          
          React.useEffect(() => { expandedPostIdRef.current = expandedPostId; }, [expandedPostId]);
          React.useEffect(() => { expandedRitualIdRef.current = expandedRitualId; }, [expandedRitualId]);

          const [sessionId, setSessionId] = useState(() => localStorage.getItem('ga_session_id') || (Date.now() + '-' + Math.random()));
          // Codice ospite leggibile/stabile: generato una volta e persistito in localStorage.
          // È l'identità del percipiente nei telepathy_trials quando si gioca da ospite (al posto
          // del sessionId illeggibile). Per gli iscritti vale l'email; questo resta inutilizzato.
          const [guestCode] = useState(() => {
            let c = localStorage.getItem('ga_guest_code');
            if (!c) { c = makeGuestCode(); localStorage.setItem('ga_guest_code', c); }
            return c;
          });
          // Cambio-modalità a turni: "primo chooser" = user1 del match; poi alterna a ogni cambio (round 7,14,...).
          const mySlot = (matchUser1Id != null) ? (sessionId === matchUser1Id ? 'user1' : 'user2') : null;
          const levelChangeIndex = Math.floor(roundCount / 7); // k: 1 al round 7, 2 al 14, ...
          const amIChooser = (mySlot !== null) && (mySlot === ((levelChangeIndex % 2 === 1) ? 'user1' : 'user2'));
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

          // SP1 moderazione — nickname che l'utente ha bloccato. La cache locale evita
          // che al primo render compaiano contenuti di un bloccato per poi sparire.
          const [blockedUsers, setBlockedUsers] = useState(() => {
            try { return JSON.parse(localStorage.getItem('ga_blocked') || '[]'); }
            catch { return []; }
          });
          // Copia sempre aggiornata della lista, letta dalle closure di polling.
          const blockedUsersRef = useRef(blockedUsers);
          useEffect(() => { blockedUsersRef.current = blockedUsers; }, [blockedUsers]);
          // Toast neutro per gli esiti positivi (blocco riuscito, segnalazione inviata).
          // errorToast esiste già ma è rosso con ⚠️: userebbe il tono sbagliato.
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
          // Dalla notifica si arriva con ?ritual=<id> (push-helpers.js). Si toglie subito
          // dall'indirizzo, come reset e magic, e si tiene qui finché i rituali non sono caricati:
          // può servire un'entrata come ospite prima.
          const [ritualeDaAprire, setRitualeDaAprire] = useState(() => {
            const p = new URLSearchParams(window.location.search);
            const id = p.get('ritual');
            if (id) window.history.replaceState({}, '', window.location.pathname);
            return id && /^\d+$/.test(id) ? Number(id) : null;
          });
          // Dalla notifica d'invito si arriva con ?invito=<id>[&azione=blocca] (push-helpers.js).
          // Un solo useState legge insieme i due parametri e POI toglie l'indirizzo: leggerli in
          // due punti farebbe perdere il secondo, già cancellato dal primo. Si tengono finché
          // l'identità non è pronta (può servire un'entrata come ospite). Un id storto si tiene
          // come null: l'apertura dirà «non trovato» invece di non mostrare niente.
          const [invitoDaAprire, setInvitoDaAprire] = useState(() => {
            if (typeof InvitiHelpers === 'undefined') return null;
            const letto = InvitiHelpers.leggiInvitoDaUrl(window.location.search);
            if (letto.presente) window.history.replaceState({}, '', window.location.pathname);
            return letto.presente ? { invito: letto.invito, azione: letto.azione } : null;
          });
          const [confermaBlocco, setConfermaBlocco] = useState(null);
          const [stanzaId, setStanzaId] = useState(null);
          const [presentiStanza, setPresentiStanza] = useState(null);
          const stanza = stanzaId != null ? rituals.find(r => r.id === stanzaId) : null;
          const [magicLinkEmail, setMagicLinkEmail] = useState('');
          const [showMagicLink, setShowMagicLink] = useState(false);
          const t = TRADUZIONI[lang] || TRADUZIONI.en;
          // Etichetta leggibile del livello (pannello sessione + chooser). Per la scala
          // mostra "N Simboli" (es. "3 Simboli"); Numeri/Lettere usano le label dedicate.
          const levelLabel = (level) => {
            if (level === 'numbers') return t.telepathy.levelNumbers;
            if (level === 'words') return t.telepathy.levelWords;
            const m = /^lvl(\d+)$/.exec(level || '');
            return m ? t.telepathy.levelShapesN(m[1]) : t.telepathy.levelShapes;
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

          // Notifiche push: la nostra domanda prima del popup del browser, il messaggio per
          // iPhone non installato, e lo stato dell'interruttore nel profilo.
          const [chiediPush, setChiediPush] = useState(false);
          const [mostraInstallaPerPush, setMostraInstallaPerPush] = useState(false);
          const [pushAttive, setPushAttive] = useState(() => {
            try {
              return typeof Notification !== 'undefined'
                && Notification.permission === 'granted'
                && localStorage.getItem('ga_push_spento') !== '1';
            } catch (_) { return false; }
          });

          // a11y (H6): l'attributo lang dell'<html> segue la lingua scelta (screen reader + pronuncia corretta).
          useEffect(() => {
            if (typeof document !== 'undefined') document.documentElement.lang = lang;
          }, [lang]);

          // a11y (H3): Esc chiude il modale aperto (priorità all'overlay più "in alto").
          useEffect(() => {
            const onKeyDown = (e) => {
              if (e.key !== 'Escape') return;
              if (showPrivacy) { setShowPrivacy(false); return; }
              if (showLogoutConfirm) { setShowLogoutConfirm(false); return; }
              if (showEndSessionConfirm) { setShowEndSessionConfirm(false); return; }
              if (showCreateRitual) { setShowCreateRitual(false); return; }
              if (showEditProfile) { setShowEditProfile(false); return; }
              if (viewingProfile) { setViewingProfile(null); return; }
              if (showNotifPanel) { setShowNotifPanel(false); return; }
            };
            document.addEventListener('keydown', onKeyDown);
            return () => document.removeEventListener('keydown', onKeyDown);
          }, [showPrivacy, showLogoutConfirm, showEndSessionConfirm, showCreateRitual, showEditProfile, viewingProfile, showNotifPanel]);

          // Toast d'errore: auto-dismiss dopo 4s.
          useEffect(() => {
            if (!errorToast) return;
            const tmr = setTimeout(() => setErrorToast(null), 4000);
            return () => clearTimeout(tmr);
          }, [errorToast]);

          // Toast neutro (SP1): stesso comportamento, tono diverso.
          useEffect(() => {
            if (!infoToast) return;
            const tmr = setTimeout(() => setInfoToast(null), 4000);
            return () => clearTimeout(tmr);
          }, [infoToast]);

          // Chiave scaduta: chi era dentro prima della 27b_ (29/09/2026) ha in memoria una credenziale
          // che il server non riconosce più. L'app lo sa solo dal rifiuto esplicito del server
          // («Auth failed», o credenziali_non_valide dalle RPC dell'account): un errore di rete non
          // conta. A quel punto si esce e si apre il login col link via email già pronto.
          // Passa da un ref perché la chiamano anche i giri di polling, che vedono la closure del
          // primo render; la funzione vera la assegna il codice dopo handleLogout.
          const eChiaveScaduta = (error) => /Auth failed/i.test((error && error.message) || '');
          const chiaveScadutaRef = React.useRef(() => {});
          const segnalaChiaveScaduta = () => chiaveScadutaRef.current();
          // Mentre la chiave sta cambiando (accesso col link, cambio password) un rifiuto può
          // portare quella di prima: in quei momenti non si fa uscire nessuno.
          const chiaveInCambio = React.useRef(0);
          const cambioChiave = async (promessa) => {
            chiaveInCambio.current++;
            try { return await promessa; }
            finally { setTimeout(() => { chiaveInCambio.current--; }, 2000); }   // il tempo che lo stato nuovo entri
          };

          // SP1 — elenco dei bloccati, ricaricato al login e dopo ogni blocco/sblocco.
          // Gli ospiti non hanno riga profiles, quindi non hanno credenziale: lista vuota.
          const reloadBlocks = useCallback(async () => {
            if (!nickname || isGuest || !passwordHash) { setBlockedUsers([]); return; }
            const { data, error } = await supabase.rpc('get_my_blocks', {
              p_nickname: nickname,
              p_password_hash: passwordHash
            });
            if (error) {   // rete giù: si tiene la cache. Chiave scaduta: si chiede di rientrare.
              if (eChiaveScaduta(error)) segnalaChiaveScaduta();
              return;
            }
            const list = (data || []).map(x => (typeof x === 'string' ? x : x.get_my_blocks)).filter(Boolean);
            setBlockedUsers(list);
            blockedUsersRef.current = list;
            try { localStorage.setItem('ga_blocked', JSON.stringify(list)); } catch {}
          }, [nickname, isGuest, passwordHash]);

          useEffect(() => { reloadBlocks(); }, [reloadBlocks]);

          // Usato da tutti i filtri di visibilità. Legge dal ref e non dallo stato:
          // i cicli di polling catturano isBlocked in una closure creata una volta
          // sola, quindi con lo stato leggerebbero per sempre la lista del primo
          // render e il filtro smetterebbe di aggiornarsi dopo un blocco.
          const isBlocked = (nick) => !!nick && blockedUsersRef.current.includes(nick);

          // SP1 — segnalazione e blocco.
          // openMenuKey sta QUI e non dentro il menu: un componente definito dentro
          // GlobalAwakeningPlatform verrebbe rimontato a ogni render, e con il polling
          // ogni 2s il menu aperto si richiuderebbe da solo.
          // { key, top|bottom, right }: le coordinate servono perche' il dropdown e'
          // position:fixed. Dentro i contenitori scrollabili (chat telepatia 220px,
          // messaggi privati 180px) un dropdown in position:absolute veniva TAGLIATO
          // dall'overflow, proprio sulle due superfici di chat.
          const [openMenu, setOpenMenu] = useState(null);
          const [blockTarget, setBlockTarget] = useState(null);   // conferma prima di bloccare
          const [reportTarget, setReportTarget] = useState(null);   // { author, type, id, snapshot }
          const [reportReason, setReportReason] = useState('spam');
          const [reportNotes, setReportNotes] = useState('');

          useEffect(() => {
            if (!openMenu) return;
            const chiudi = () => setOpenMenu(null);
            const onEsc = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
            // Lo scroll va chiuso perche' il menu e' position:fixed con coordinate
            // catturate al click: scorrendo resterebbe sopra una card diversa da
            // quella che lo ha aperto. Ma si ignorano gli scroll che nascono DENTRO
            // il menu e quelli dei primi 250ms: il browser scrolla da solo per
            // portare un elemento in vista, e il menu si richiuderebbe per colpa
            // dello stesso gesto che lo ha aperto.
            const apertoDa = Date.now();
            const onScroll = (e) => {
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

          const doBlock = async (nick) => {
            if (isGuest || !passwordHash) { setErrorToast(t.moderation.guestOnly); return; }
            const { error } = await supabase.rpc('block_user', {
              p_nickname: nickname, p_password_hash: passwordHash, p_blocked_nickname: nick
            });
            if (error) { if (eChiaveScaduta(error)) segnalaChiaveScaduta(); else setErrorToast(error.message); return; }
            await reloadBlocks();
            setInfoToast(t.moderation.blockDone);
          };

          const doUnblock = async (nick) => {
            if (isGuest || !passwordHash) return;
            const { error } = await supabase.rpc('unblock_user', {
              p_nickname: nickname, p_password_hash: passwordHash, p_blocked_nickname: nick
            });
            if (error) { if (eChiaveScaduta(error)) segnalaChiaveScaduta(); else setErrorToast(error.message); return; }
            await reloadBlocks();
            setInfoToast(t.moderation.unblockDone);
          };

          const doReport = async () => {
            if (!reportTarget) return;
            if (isGuest || !passwordHash) { setErrorToast(t.moderation.guestOnly); return; }
            const { error } = await supabase.rpc('report_content', {
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
            if (error) { if (eChiaveScaduta(error)) segnalaChiaveScaduta(); else setErrorToast(error.message); }
            else setInfoToast(t.moderation.reportDone);
          };

          // Menu ⋯ sui contenuti ALTRUI, solo per account registrati.
          // Funzione che ritorna JSX, non un componente: nessuna identita' da
          // riconciliare, nessuno stato interno da perdere.
          const moderationMenu = ({ author, type, id, snapshot }) => {
            if (!author || author === nickname) return null;
            const key = `${type}:${id || author}`;
            const open = openMenu && openMenu.key === key;

            const apri = (e) => {
              e.stopPropagation();   // senza questo il listener su document richiude subito
              // Gli ospiti non hanno credenziale: invece di un menu che non farebbe nulla,
              // si spiega perche' serve un account.
              if (isGuest) { setErrorToast(t.moderation.guestOnly); return; }
              if (open) { setOpenMenu(null); return; }
              const r = e.currentTarget.getBoundingClientRect();
              const flipUp = (window.innerHeight - r.bottom) < 110;
              setOpenMenu({
                key, author, type, id, snapshot,
                top: flipUp ? null : r.bottom + 4,
                bottom: flipUp ? (window.innerHeight - r.top + 4) : null,
                right: Math.min(Math.max(8, window.innerWidth - 184),
                                Math.max(8, window.innerWidth - r.right))
              });
            };

            // Il dropdown NON sta qui dentro: renderizzato dentro la card, il suo
            // z-index resterebbe confinato nel contesto di impilamento della card e
            // finirebbe SOTTO le card successive (e tagliato dagli overflow delle chat).
            // Vive a livello radice, uno solo, guidato da openMenu.
            return (
              <span style={{marginLeft: 'auto'}}>
                <button
                  aria-label={t.moderation.menu}
                  aria-expanded={!!open}
                  onClick={apri}
                  className="text-secondary"
                  style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem',
                          lineHeight: 1, padding: '0.25rem 0.5rem', minHeight: '32px'}}
                >⋯</button>
              </span>
            );
          };

          // Pulizia stato remoto alla chiusura del tab.
          // sendBeacon non supporta DELETE: usiamo fetch con keepalive=true che il browser
          // garantisce di completare anche dopo unload.
          const matchIdRef = React.useRef(null);
          const sessionIdRef = React.useRef(null);
          React.useEffect(() => { matchIdRef.current = matchId; }, [matchId]);
          React.useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
          // Le RPC degli inviti si chiamano anche da intervalli (presenze, attese) nati in un
          // render vecchio: le credenziali si leggono dai ref, non dalla chiusura.
          const passwordHashRef = React.useRef(null);
          const invitoInUscitaRef = React.useRef(null);
          const attesaInvitanteRef = React.useRef(null);
          React.useEffect(() => { passwordHashRef.current = passwordHash; }, [passwordHash]);
          React.useEffect(() => { invitoInUscitaRef.current = invitoInUscita; }, [invitoInUscita]);
          React.useEffect(() => { attesaInvitanteRef.current = attesaInvitante; }, [attesaInvitante]);
          const IH = typeof InvitiHelpers !== 'undefined' ? InvitiHelpers : null;
          const testoInviti = (chiave, valori) => (IH ? IH.testo(chiave, lang, valori) : String(chiave));
          const rpcInviti = async (fn, extra) => {
            const { data, error } = await supabase.rpc(fn, {
              p_session_id: sessionIdRef.current || sessionId,
              p_password_hash: passwordHashRef.current || null,
              ...(extra || {})
            });
            // Il client fatto a mano non solleva: un errore (rete, Auth failed) torna qui.
            // «Auth failed» (credenziale vecchia) ha un messaggio suo: «accedi di nuovo».
            if (error) {
              // Solo se la chiamata portava una credenziale: subito dopo l'uscita una chiamata
              // in volo parte senza, e quel rifiuto non dice niente della chiave.
              if (eChiaveScaduta(error) && passwordHashRef.current) segnalaChiaveScaduta();
              return { ok: false, motivo: IH ? IH.chiaveDaErrore(error) : 'errore' };
            }
            return data;
          };
          // L'invito in arrivo lo dice solo il server (ce n'è al massimo uno): loop delle presenze,
          // campanella e push arrivate in primo piano passano tutti da qui. Con un errore (rete,
          // Auth failed) il banner resta com'è: un errore non vale «l'invito non c'è più».
          const aggiornaInviti = async () => {
            const r = await rpcInviti('get_my_telepathy_invites', {});
            if (!r || !r.ok) return null;
            if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
            const a = r.in_arrivo;
            // I blocchi li filtra già il server; isBlocked copre la lista locale appena cambiata.
            setIncomingInvite(a && !isBlocked(a.nome)
              ? { from_id: a.from_id, from_name: a.nome, invite_id: a.id, expires_at: a.expires_at } : null);
            return r;
          };
          React.useEffect(() => { if (giroInviti) aggiornaInviti(); }, [giroInviti]);
          // Il service worker avvisa quando una push d'invito arriva con l'app in primo piano (e
          // non la mostra): si rilegge subito. Un messaggio perso lo recupera il giro delle
          // presenze (4 s). «apri-invito» (tocco sulla notifica con l'app già aperta): si apre
          // l'invito per la stessa strada di ?invito=…[&azione=blocca] (invitoDaAprire) e si
          // conferma sempre sulla porta, così il service worker non ricarica la pagina in mezzo a
          // un training. L'id arriva grezzo dal service worker: lo si valida come quello
          // dell'indirizzo (uno storto finisce in «non trovato»).
          React.useEffect(() => {
            if (!('serviceWorker' in navigator)) return;
            const ascolta = (ev) => {
              const d = ev.data || {};
              if (d.tipo === 'apri-invito') {
                const letto = IH ? IH.leggiInvitoDaUrl('?invito=' + encodeURIComponent(String(d.invito || ''))) : null;
                if (letto) setInvitoDaAprire({ invito: letto.invito, azione: d.azione === 'blocca' ? 'blocca' : null });
                setGiroInviti((x) => x + 1);
                if (ev.ports && ev.ports[0]) ev.ports[0].postMessage({ ok: true });
                return;
              }
              if (['invito', 'accettato', 'rifiutato', 'scaduto'].includes(d.tipo)) setGiroInviti((x) => x + 1);
            };
            navigator.serviceWorker.addEventListener('message', ascolta);
            return () => navigator.serviceWorker.removeEventListener('message', ascolta);
          }, []);
          // I conti alla rovescia ticchettano solo quando c'è qualcosa da contare.
          React.useEffect(() => {
            if (!invitoInUscita && !attesaInvitante) return;
            // Subito, non fra un secondo: da fermo adessoLocale è vecchio e il primo conto
            // mostrerebbe più tempo del vero (visto nel test: 0:51 su 45 s).
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
              const opts = { method: 'DELETE', headers: SB_HEADERS, keepalive: true };
              const mid = matchIdRef.current;
              const sid = sessionIdRef.current;
              try {
                if (mid) {
                  fetch(`${SUPABASE_URL}/rest/v1/telepathy_matches?id=eq.${mid}`, opts);
                  fetch(`${SUPABASE_URL}/rest/v1/telepathy_chat?match_id=eq.${mid}`, opts);
                }
                if (sid) {
                  fetch(`${SUPABASE_URL}/rest/v1/telepathy_queue?id=eq.${sid}`, opts);
                  // L'invito in uscita NON si cancella: chiudere l'app non lo ritira più (spec §4.4). Si ritira con «Annulla» o uscendo dalla telepatia.
                }
              } catch(e) {}
            };
            window.addEventListener('beforeunload', handleUnload);
            return () => window.removeEventListener('beforeunload', handleUnload);
          }, []);

          // Load scores: per utenti registrati il valore canonico arriva dal DB (handleLogin/loadProfile),
          // quindi evitiamo il flash dei valori localStorage di un'eventuale sessione precedente.
          useEffect(() => {
            if (localStorage.getItem('ga_email')) return;
            const score = localStorage.getItem('telepathy_score');
            const best = localStorage.getItem('telepathy_best');
            if (score) setTotalRounds(parseInt(score));
            if (best) setTotalMatches(parseInt(best));
          }, []);

          // B1 (bug 6, coerenza guest): il cache localStorage sopra puo' restare indietro
          // rispetto a telepathy_scores (fonte unica) — es. se un round e' stato conteggiato
          // lato server ma questo client non ha mai rieseguito endSession per rileggerlo.
          // All'apertura di "Modifica Profilo" i guest si risincronizzano leggendo la propria
          // riga (user_id = sessionId, stessa tabella già letta pubblicamente in classifica —
          // nessuna nuova esposizione, e' il proprio dato). Nessun effetto per i registrati:
          // il loro percorso (login/loadProfile) e' gia' verificato corretto, fuori scope B1.
          useEffect(() => {
            if (!showEditProfile || !isGuest || !sessionId) return;
            let cancelled = false;
            (async () => {
              try {
                const { data } = await supabase.rpc('get_my_telepathy_totals', { p_user_id: sessionId, p_password_hash: null });
                if (cancelled || !data || data.length === 0) return;
                const r = data[0].rounds_count || 0;
                const m = data[0].matches_count || 0;
                setTotalRounds(r);
                setTotalMatches(m);
                localStorage.setItem('telepathy_score', String(r));
                localStorage.setItem('telepathy_best', String(m));
              } catch (e) { /* fonte unica non raggiungibile: mantiene la cache locale */ }
            })();
            return () => { cancelled = true; };
          }, [showEditProfile, isGuest, sessionId]);

          // Update presence in Supabase
          useEffect(() => {
            if (!nickname) return;

            const myLat = 20 + Math.random() * 50;
            const myLng = -120 + Math.random() * 200;

            const updatePresence = async () => {
              try {
                const { error: upsertError } = await supabase.from('online_users').upsert({
                  id: sessionId,
                  nickname: nickname || 'Anonymous',
                  lat: myLat,
                  lng: myLng,
                  last_seen: new Date().toISOString()
                });

                if (upsertError) console.warn('Presence upsert error:', upsertError);

                // Clean old users (finestra tollerante: 2 min, regge brevi background mobile)
                await supabase.from('online_users').delete().lt('last_seen', new Date(Date.now() - 120000).toISOString());

                // Fetch current online users
                const { data, error: fetchError } = await supabase.from('online_users').select('*');
                if (fetchError) {
                  console.warn('Fetch online users error:', fetchError);
                  // Fallback: at least show yourself
                  setOnlineUsers([{ id: sessionId, nickname, lat: myLat, lng: myLng }]);
                } else {
                  // Deduplica per nickname: tieni solo il record più recente per persona.
                  // Vale sia per la community (onlineUsers, contatori "starseeds"/"online")
                  // sia per la lista telepatia, così niente doppioni (es. "dario, dario")
                  // quando una persona ha più sessioni/tab nella finestra di presenza.
                  const sortedByDate = (data || []).slice().sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
                  const seenNicks = new Set();
                  const uniqueUsers = [];
                  for (const u of sortedByDate) {
                    if (!seenNicks.has(u.nickname)) {
                      seenNicks.add(u.nickname);
                      uniqueUsers.push(u);
                    }
                  }
                  setOnlineUsers(uniqueUsers.length > 0 ? uniqueUsers : [{ id: sessionId, nickname, lat: myLat, lng: myLng }]);

                  // Arricchisci utenti con stato 'in sessione' o 'disponibile'.
                  // Solo i match ANCORA attivi rendono 'busy': un match con ended_at
                  // valorizzato e' una sessione gia' conclusa (fine deterministica
                  // condivisa, A1) la cui riga puo' sopravvivere alla chiusura finche'
                  // non viene cancellata (delete ritardata ~6s / cleanup periodico 5min).
                  // Senza filtrare ended_at gli utenti restavano "in sessione" per gli
                  // altri anche dopo aver chiuso, senza poter ricevere nuovi inviti.
                  const { data: activeMatches } = await supabase.from('telepathy_matches').select('*');
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

                  // Invito in arrivo: dal server (niente più SELECT diretta né pulizia dei 2 minuti:
                  // la scadenza la decide expires_at, e un invito da 10 minuti resta valido).
                  await aggiornaInviti();
                }
              } catch (err) {
                console.warn('Presence update failed:', err);
                setOnlineUsers([{ id: sessionId, nickname, lat: myLat, lng: myLng }]);
              }
            };

            updatePresence();
            // Battito più frequente (4s) per una presenza reattiva (conta per telepatia/community).
            const interval = setInterval(updatePresence, 4000);
            // Risveglio: al ritorno in primo piano (riapertura app/tab mobile, dove i timer
            // erano congelati) riscrive e rilegge SUBITO, senza aspettare il prossimo giro.
            const onVisible = () => { if (document.visibilityState === 'visible') updatePresence(); };
            document.addEventListener('visibilitychange', onVisible);
            return () => {
              clearInterval(interval);
              document.removeEventListener('visibilitychange', onVisible);
              supabase.from('online_users').delete().eq('id', sessionId);
            };
          }, [nickname, sessionId]);

          // Load data from Supabase
          useEffect(() => {
            const loadData = async () => {
              const { data: ritualsData } = await supabase.from('rituali_correnti').select('*').order('created_at', { ascending: false });
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

              const { data: postsData } = await supabase.from('consciousness_posts').select('*').order('created_at', { ascending: false }).limit(50);
              if (postsData) setPosts(postsData.filter(x => !isBlocked(x.author_nickname)));

              if (expandedPostIdRef.current) {
                const { data: commentsData } = await supabase.from('consciousness_comments').select('*').eq('post_id', expandedPostIdRef.current).order('created_at', { ascending: true });
                if (commentsData) setCommentsMap(prev => ({ ...prev, [expandedPostIdRef.current]: commentsData.filter(x => !isBlocked(x.author_nickname)) }));
              }
              if (expandedRitualIdRef.current) {
                const { data: rCommentsData } = await supabase.from('ritual_comments').select('*').eq('ritual_id', expandedRitualIdRef.current).order('created_at', { ascending: true });
                if (rCommentsData) setRitualCommentsMap(prev => ({ ...prev, [expandedRitualIdRef.current]: rCommentsData.filter(x => !isBlocked(x.author_nickname)) }));
              }
            };
            
            loadData();
            const interval = setInterval(loadData, 10000);
            
            // Subscribe to real-time updates
            // Le viste non emettono eventi realtime: si ascolta la tabella, e ogni modifica fa
            // comunque ricaricare da rituali_correnti (loadData).
            const ritualsChannel = supabase.channel('rituals-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'rituals' }, () => loadData()).subscribe();

            return () => {
              clearInterval(interval);
              ritualsChannel.unsubscribe();
            };
          }, []);

          // Telepathy matching
          const [queuePosition, setQueuePosition] = useState(0);
          const [queueSize, setQueueSize] = useState(0);

          useEffect(() => {
            if (!searchingPartner) return;

            const findPartner = async () => {
              // Clean old entries
              await supabase.from('telepathy_queue').delete().lt('timestamp', Date.now() - 60000);
              // Non più «tutto ciò che è nato da 5 minuti», che cancellava anche i training lunghi
              // (spec §4.4, secondo e terzo giro). Tre delete separati: il client fatto a mano
              // conosce solo .eq/.neq/.lt. Chiusi da più di un minuto (resta il tempo per la
              // schermata finale), fermi da 10, orfani mai giocati nati da più di 5 (chi accetta
              // aspetta al massimo 3).
              const adesso = Date.now();
              await supabase.from('telepathy_matches').delete().lt('ended_at', new Date(adesso - 60000).toISOString());
              await supabase.from('telepathy_matches').delete().lt('ultima_attivita', new Date(adesso - 600000).toISOString());
              await supabase.from('telepathy_matches').delete().eq('giocato', false).lt('created_at', new Date(adesso - 300000).toISOString());
              // «Vivo» per l'abbinamento: non chiuso e non un orfano d'invito mai giocato. I match
              // casuali appena nati restano vivi: è così che chi è in coda scopre il match creato
              // dall'altro, prima che nessuno abbia giocato.
              const vivo = (m) => !m.ended_at && !(m.da_invito && !m.giocato);

              // 1. Check if someone already matched with me
              const { data: matches } = await supabase.from('telepathy_matches').select('*');
              if (matches) {
                // Solo match ATTIVI (ended_at null): un match concluso residuo non deve far
                // "rientrare" in una sessione finita invece di cercare un nuovo partner.
                const myMatch = matches.find(m => (m.user1_id === sessionId || m.user2_id === sessionId) && vivo(m));
                if (myMatch) {
                  const amUser1 = myMatch.user1_id === sessionId;
                  // SP1: mai una sessione con chi ho bloccato. Il match si chiude, se no
                  // il polling lo ritroverebbe a ogni tick e non cercherei mai un altro.
                  const altroNick = amUser1 ? myMatch.user2_nickname : myMatch.user1_nickname;
                  if (isBlocked(altroNick)) {
                    try { await supabase.rpc('end_telepathy_match', { p_match_id: myMatch.id, p_ended_by: sessionId }); }
                    catch (e) { /* RPC non applicata: il match scade comunque a TTL */ }
                    return;
                  }
                  setPartner({ id: amUser1 ? myMatch.user2_id : myMatch.user1_id, nickname: altroNick });
                  setRole(amUser1 ? myMatch.user1_role : myMatch.user2_role);
                  setMatchId(myMatch.id);
                  setSearchingPartner(false);
                  // Remove from queue
                  await supabase.from('telepathy_queue').delete().eq('id', sessionId);
                  return;
                }
              }

              // 2. Look for someone in queue
              const { data: queue } = await supabase.from('telepathy_queue').select('*').neq('id', sessionId).order('timestamp', { ascending: true });

              // SP1: scarta dalla coda chi ho bloccato; se resta solo lui, si attende
              // il tick successivo invece di accoppiarsi.
              const queueLibera = (queue || []).filter(q => !isBlocked(q.nickname));

              if (queueLibera.length > 0) {
                const available = queueLibera[0];

                // Re-check pre-insert: tra il primo SELECT (riga sopra) e l'INSERT, un altro
                // client puo' avermi appena matchato o aver matchato 'available' con un terzo.
                // NB: lato DB serve anche un UNIQUE constraint su (LEAST(u1,u2),GREATEST(u1,u2))
                // per chiudere completamente la race. Questo client-side dedup la mitiga.
                const { data: precheck } = await supabase.from('telepathy_matches').select('*');
                // Solo match ATTIVI: un match concluso residuo non conta come "gia' matchato".
                const existingForMe = (precheck || []).find(m => (m.user1_id === sessionId || m.user2_id === sessionId) && vivo(m));
                if (existingForMe) {
                  const amUser1 = existingForMe.user1_id === sessionId;
                  setPartner({ id: amUser1 ? existingForMe.user2_id : existingForMe.user1_id, nickname: amUser1 ? existingForMe.user2_nickname : existingForMe.user1_nickname });
                  setRole(amUser1 ? existingForMe.user1_role : existingForMe.user2_role);
                  setMatchId(existingForMe.id);
                  setSearchingPartner(false);
                  await supabase.from('telepathy_queue').delete().eq('id', sessionId);
                  return;
                }
                const existingForThem = (precheck || []).find(m => (m.user1_id === available.id || m.user2_id === available.id) && vivo(m));
                if (existingForThem) {
                  // available e' in un match ATTIVO con qualcun altro: prossimo tick rifara' lookup
                  // (un match concluso residuo di 'available' non deve escluderlo dal matchmaking)
                  return;
                }

                const myRole = Math.random() > 0.5 ? 'sender' : 'receiver';
                const theirRole = myRole === 'sender' ? 'receiver' : 'sender';

                // Create match record so both users can see it
                const { data: matchData } = await supabase.from('telepathy_matches').insert({
                  user1_id: available.id,
                  user1_nickname: available.nickname,
                  user1_role: theirRole,
                  user2_id: sessionId,
                  user2_nickname: nickname || 'Anonymous',
                  user2_role: myRole,
                  level: 'lvl3' // ogni sessione parte dal livello più facile (3 card)
                });

                if (!matchData || matchData.length === 0) {
                  // INSERT fallita. Causa tipica: vincolo pair_unique in conflitto con un match GIA'
                  // CONCLUSO residuo della coppia (un match ended sopravvive ~6s per la fine
                  // condivisa A1). Lo rimuovo — per id e SOLO se ended, quindi mai una sessione
                  // attiva — e ritento al tick successivo. Reattivo (non preventivo) per non
                  // aggiungere query nel path felice e non alterare la race del matchmaking random.
                  const { data: staleAll } = await supabase.from('telepathy_matches').select('*');
                  for (const m of (staleAll || [])) {
                    const isPair = (m.user1_id === sessionId && m.user2_id === available.id) || (m.user1_id === available.id && m.user2_id === sessionId);
                    if (isPair && m.ended_at) await supabase.from('telepathy_matches').delete().eq('id', m.id);
                  }
                  return;
                }

                // Post-insert dedup: se entrambi i client hanno fatto INSERT in parallelo, il match
                // piu' vecchio (per created_at) vince. Cancello eventuali duplicati per la stessa coppia.
                const { data: postcheck } = await supabase.from('telepathy_matches').select('*');
                const pairMatches = (postcheck || []).filter(m =>
                  !m.ended_at && (
                    (m.user1_id === sessionId && m.user2_id === available.id) ||
                    (m.user2_id === sessionId && m.user1_id === available.id)
                  )
                );
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
                setPartner({ id: amUser1 ? winner.user2_id : winner.user1_id, nickname: amUser1 ? winner.user2_nickname : winner.user1_nickname });
                setRole(amUser1 ? winner.user1_role : winner.user2_role);
                setMatchId(winner.id);

                // Remove both from queue
                await supabase.from('telepathy_queue').delete().eq('id', sessionId);
                await supabase.from('telepathy_queue').delete().eq('id', available.id);

                setSearchingPartner(false);
              } else {
                // Add self to queue
                await supabase.from('telepathy_queue').upsert({
                  id: sessionId,
                  nickname: nickname || 'Anonymous',
                  timestamp: Date.now()
                });

                // Update queue info
                const { data: allQueue } = await supabase.from('telepathy_queue').select('*').order('timestamp', { ascending: true });
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
            // Senza questa riga l'ospite riceveva un identificativo NUOVO a ogni riapertura
            // dell'app (src/app.jsx:996 lo rigenera quando non lo trova), e per l'app
            // diventava un'altra persona: fuori dai rituali a cui aveva aderito, non più
            // creatore dei propri, con la candela accesa da uno sconosciuto e i punteggi di
            // telepatia azzerati. Si scrive qui e non all'avvio perché fino a questo momento
            // la persona non è ancora entrata, e non le mettiamo un identificativo in tasca
            // mentre sta ancora decidendo.
            localStorage.setItem('ga_session_id', sessionId);
            localStorage.removeItem('ga_email');
            setNickname(name);
            setIsGuest(true);
            setUserEmail('');
            setShowNicknamePrompt(false);
            setLoginError('');
            setLoginSuccess('');
          };

          // Fonde round/matches del guest (user_id = sessionId casuale) sull'account appena
          // loggato/registrato (user_id = email). Tutta la transazione (sum + upsert + delete
          // riga guest) avviene server-side nella RPC merge_telepathy_scores con SECURITY
          // DEFINER — bypassa la policy DELETE auth.uid che altrimenti lascerebbe la riga
          // guest orfana. La RPC (26_, 4 parametri) verifica anche la credenziale dell'account
          // di destinazione: senza un hash valido rifiuta la fusione (RAISE 'Auth failed').
          const mergeGuestTelepathyData = async (oldSid, newUserId, currentNickname, credenziale) => {
            if (!oldSid || !newUserId || oldSid === newUserId || !credenziale) return null;
            const { data, error } = await supabase.rpc('merge_telepathy_scores', {
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

            // Cattura sessionId guest PRIMA che venga sovrascritto dal sid del profilo loggato
            const prevGuestSid = sessionId;
            const wasGuest = !userEmail;

            // Login lato server (26_): il browser non vede più l'hash salvato. Riceve solo sale e
            // iterazioni, calcola l'hash e lo manda; manda anche l'SHA-256 vecchio, che il server
            // usa solo per gli account non ancora migrati.
            setAuthLoading(true);
            let esito;
            let effectiveHash;
            try {
              const { data: par, error: parErr } = await supabase.rpc('get_login_params', { p_email: email });
              if (parErr || !par || !par.salt) throw new Error('params');
              const salt = Uint8Array.from(atob(par.salt), c => c.charCodeAt(0));
              effectiveHash = await deriveStrongHash(pw, salt, par.iter);
              const legacyHash = await hashPassword(pw);
              const { data, error } = await supabase.rpc('login_with_password', {
                p_email: email, p_hash: effectiveHash, p_legacy_hash: legacyHash
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

            // Stesso session_id (login sullo stesso account): la disponibilità resta di chi entra.
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

            // Fusione dati guest: se l'utente ha giocato come guest in questo browser
            // PRIMA del login, sposta i suoi round/matches sull'account.
            if (wasGuest) {
              const merged = await mergeGuestTelepathyData(prevGuestSid, email, existing.nickname || 'Anonymous', effectiveHash);
              if (merged) {
                setTotalRounds(merged.rounds_count);
                setTotalMatches(merged.matches_count);
                localStorage.setItem('telepathy_score', String(merged.rounds_count));
                localStorage.setItem('telepathy_best', String(merged.matches_count));
                await supabase.rpc('update_my_profile', {
                  p_nickname: existing.nickname, p_password_hash: effectiveHash,
                  p_fields: { telepathy_score: merged.rounds_count, telepathy_best: merged.matches_count }
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

            // Cattura il sid guest prima della sovrascrittura, per fondere i dati telepatia
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
            // Unicità di email e nickname decisa dal server (26_), non da due controlli nel browser.
            const { data: reg, error: regErr } = await supabase.rpc('register_account', {
              p_session_id: newSid, p_nickname: name, p_email: email, p_hash: hash
            });
            if (regErr || !reg) { setLoginError(t.connectionError); setAuthLoading(false); return; }
            if (!reg.ok) {
              const msg = { email_in_uso: t.emailAlreadyUsed, nickname_in_uso: t.usernameAlreadyUsed,
                            troppi_tentativi: t.tooManyAttempts }[reg.motivo];
              setLoginError(msg || t.registrationFailed);
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

            // Fusione dati guest sull'account appena creato
            if (wasGuest) {
              const merged = await mergeGuestTelepathyData(prevGuestSid, email, name, hash);
              if (merged) {
                setTotalRounds(merged.rounds_count);
                setTotalMatches(merged.matches_count);
                localStorage.setItem('telepathy_score', String(merged.rounds_count));
                localStorage.setItem('telepathy_best', String(merged.matches_count));
                await supabase.rpc('update_my_profile', {
                  p_nickname: name, p_password_hash: hash,
                  p_fields: { telepathy_score: merged.rounds_count, telepathy_best: merged.matches_count }
                });
              }
            }
            setAuthLoading(false);
          };

          // Token ed email li fa il server (send-account-email). SUPABASE_URL e SB_HEADERS sono
          // i globali definiti in app.html accanto al client REST.
          const inviaEmailAccount = async (tipo, email) => {
            try {
              const res = await fetch(`${SUPABASE_URL}/functions/v1/send-account-email`, {
                method: 'POST', headers: SB_HEADERS, body: JSON.stringify({ tipo, email })
              });
              return res.ok;
            } catch (e) {
              return false;
            }
          };

          const handleSendResetEmail = async () => {
            const email = resetEmail.trim().toLowerCase();
            if (!email) { setLoginError(t.fillAllFields); return; }
            if (!isValidEmail(email)) { setLoginError(t.invalidEmail); return; }
            setLoginError('');
            setLoginSuccess('');
            setAuthLoading(true);
            const ok = await inviaEmailAccount('reset', email);
            if (ok) { setLoginSuccess(t.resetEmailSent); setResetEmail(''); }
            else setLoginError(t.connectionError);
            setAuthLoading(false);
          };

          const handleSetNewPassword = async () => {
            const pw = resetNewPassword.trim();
            const pw2 = resetConfirmPassword.trim();
            if (!pw || !pw2) { setLoginError(t.fillAllFields); return; }
            if (pw !== pw2) { setLoginError(t.passwordsNoMatch); return; }
            setLoginError('');
            setLoginSuccess('');
            try {
              setAuthLoading(true);
              const hash = await deriveStrongHash(pw);
              const { data: esito, error } = await supabase.rpc('reset_password', { p_token: resetToken, p_new_hash: hash });
              if (error || !esito) { setLoginError(t.connectionError); setAuthLoading(false); return; }
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
              setTimeout(() => { setAuthTab('login'); setLoginSuccess(''); }, 2500);
            } catch (err) {
              setLoginError(t.connectionError);
            } finally {
              setAuthLoading(false);
            }
          };

          const handleSendMagicLink = async () => {
            const email = magicLinkEmail.trim().toLowerCase();
            if (!email) { setLoginError(t.fillAllFields); return; }
            if (!isValidEmail(email)) { setLoginError(t.invalidEmail); return; }
            setLoginError('');
            setLoginSuccess('');
            setAuthLoading(true);
            const ok = await inviaEmailAccount('magic', email);
            if (ok) { setLoginSuccess(t.magicLinkSent); setMagicLinkEmail(''); setShowMagicLink(false); }
            else setLoginError(t.connectionError);
            setAuthLoading(false);
          };

          useEffect(() => {
            if (!magicToken) return;
            const loginWithMagicToken = async () => {
              // Cattura sid guest prima della sovrascrittura per la fusione dati
              const prevGuestSid = sessionId;
              const wasGuest = !userEmail;
              const { data: esito, error } = await supabase.rpc('consume_magic_link', { p_token: magicToken });
              if (error || !esito) { setLoginError(t.connectionError); return; }
              if (!esito.ok) { setLoginError(t.magicLinkInvalid); return; }
              const existing = esito.profilo;
              const email = existing.email;
              const credenziale = esito.password_hash;
              // Con la credenziale di chi se ne va (un account si spegne solo così); niente se
              // il link riapre lo stesso account.
              if (existing.session_id !== sessionId) await spegniDisponibilitaDi(sessionId, passwordHash);
              setSessionId(existing.session_id);
              localStorage.setItem('ga_session_id', existing.session_id);
              setUserEmail(email);
              setIsGuest(false);
              // La credenziale arriva dal server anche per gli account che non l'avevano (26_):
              // senza, messaggi e profilo resterebbero chiusi a chi è entrato col link.
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
                    p_fields: { telepathy_score: merged.rounds_count, telepathy_best: merged.matches_count }
                  });
                }
              }
            };
            cambioChiave(loginWithMagicToken());   // tutto l'accesso, non solo il link: lo stato nuovo arriva dopo altre attese
          }, [magicToken]);

          const handleLogout = () => {
            // Le notifiche push restano legate al TELEFONO, non alla persona: senza questa
            // pulizia, chi entra dopo sullo stesso telefono continuerebbe a ricevere
            // «Luna piena sta iniziando ora» per i rituali di chi è appena uscito — col nome
            // del rituale in chiaro sulla schermata di blocco. E chi è uscito smetterebbe di
            // ricevere le sue notifiche senza saperlo.
            // Stessa cosa per «Disponibili su invito»: la chiamata parte con la credenziale di chi
            // esce, prima che venga cancellata qui sotto (senza await: handleLogout non è asincrona).
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
            setProfile({ bio: '', starseedType: '', avatar: '', country: '', interests: [], experienceLevel: '' });
            setTotalRounds(0);
            setTotalMatches(0);
            setSessionMatches(0);
            setRoundCount(0);
            setShowNicknamePrompt(true);
          };

          // Una volta sola anche se più chiamate rifiutano insieme (blocchi, messaggi, inviti
          // partono quasi tutti all'avvio). L'email si tiene: handleLogout la cancella, e chi
          // rientra la trova già scritta nel riquadro del link.
          const chiaveScadutaInCorso = React.useRef(false);
          const nicknameRef = React.useRef(nickname);
          nicknameRef.current = nickname;
          chiaveScadutaRef.current = async () => {
            // Vale solo per chi è ancora dentro come iscritto: un rifiuto che arriva dopo l'uscita,
            // o a un ospite, non è una chiave scaduta.
            if (chiaveScadutaInCorso.current || chiaveInCambio.current > 0 || isGuest || !userEmail) return;
            chiaveScadutaInCorso.current = true;
            const email = userEmail || '';
            // Prima di far uscire qualcuno si richiede con la chiave di ADESSO: una chiamata partita
            // un attimo prima di un cambio password porta la chiave vecchia e viene rifiutata, ma
            // la chiave nuova è buona. Si esce solo se il server rifiuta anche questa.
            // Un secondo e mezzo di attesa: se il rifiuto è arrivato prima della risposta del cambio
            // password, la chiave nuova fa in tempo a entrare in memoria.
            await new Promise((r) => setTimeout(r, 1500));
            const chiaveOra = passwordHashRef.current;
            if (chiaveInCambio.current > 0) { chiaveScadutaInCorso.current = false; return; }
            if (chiaveOra) {
              // Nickname dal ref, non dalla closure: dopo un accesso col link può essere cambiato.
              const { error } = await supabase.rpc('get_my_blocks', { p_nickname: nicknameRef.current, p_password_hash: chiaveOra });
              if (!eChiaveScaduta(error)) { chiaveScadutaInCorso.current = false; return; }
            }
            handleLogout();
            // handleLogout porta sulla linguetta Ospite: si torna sul login dopo, come a «Registrati».
            setTimeout(() => {
              setAuthTab('login');
              setShowResetForm(false);
              setMagicLinkEmail(email);
              setShowMagicLink(true);
              setLoginError(t.sessionExpired);
              chiaveScadutaInCorso.current = false;
            }, 100);
          };
          // Iscritto senza nessuna credenziale in memoria: non può usare niente di protetto, ed è
          // lo stesso caso della chiave scaduta. Non durante l'accesso col link (?magic=), che la crea.
          useEffect(() => {
            if (!isGuest && userEmail && !passwordHash && !magicToken) segnalaChiaveScaduta();
            // eslint-disable-next-line react-hooks/exhaustive-deps
          }, []);

          // Export GDPR: chiama la RPC, scarica il risultato come file JSON.
          const exportMyData = async () => {
            if (gdprBusy) return;
            setGdprBusy(true);
            const { data, error } = await supabase.rpc('export_my_account', {
              p_nickname: nickname,
              p_password_hash: passwordHash
            });
            setGdprBusy(false);
            if (error || !data) { showErrorToast(t.gdprExportError); return; }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `global-awakening-dati-${nickname}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          };

          // Delete GDPR: chiama la RPC; a successo logout completo + chiusura modali.
          const confirmDeleteAccount = async () => {
            if (gdprBusy) return;
            setGdprBusy(true);
            const { error } = await supabase.rpc('delete_my_account', {
              p_nickname: nickname,
              p_password_hash: passwordHash
            });
            setGdprBusy(false);
            if (error) { showErrorToast(t.gdprDeleteError); return; }
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

          // Durante l'attesa di chi ha invitato non si gioca: il primo update del match accende
          // giocato e chiuderebbe l'attesa prima che l'altro arrivi (I1).
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

          const proposeLevelChange = async (choice) => {
            // Cambio-modalità a turni: solo il chooser scrive; la scelta si applica subito.
            // choice ∈ 'lvl3'|'lvl5'|'lvl7'|'lvl9'|'numbers'|'words'|'keep'. 'keep' = resta sulla modalità attuale.
            const bannerRound = Math.floor(roundCount / 7) * 7; // 7,14,...
            const newLevel = (choice === 'keep') ? currentLevel : choice;
            setCurrentLevel(newLevel);
            setShowLevelBanner(false);
            lastProcessedRoundRef.current = -1;
            await supabase.from('telepathy_matches').update({
              level: newLevel,
              level_change_choice_sender: 'r' + bannerRound, // marcatore "scelta fatta" (vale anche per 'keep')
            }).eq('id', matchId);
          };

          // Poll for telepathy result when waiting
          useEffect(() => {
            if (!matchId || !waitingForPartner) return;

            const pollResult = async () => {
              const { data } = await supabase.from('telepathy_matches').select('*').eq('id', matchId);
              // Match cambiato mentre la select era in volo (Accept post-sessione crea un match
              // nuovo): non applicare esiti/flag del match vecchio sulla sessione nuova.
              if (matchIdRef.current !== matchId) return;
              if (!data || data.length === 0) {
                // Il partner ha abbandonato la sessione — forza fine sessione su questo lato
                setPartnerDisconnected(true);
                setSessionEnded(true);
                setShowResult(false);
                setWaitingForPartner(false);
                return;
              }
              const match = data[0];

              // Fine sessione come stato condiviso su DB (flag ended_at/ended_by): entrambi i
              // lati chiudono in modo identico e deterministico, invece di dedurlo dalla
              // scomparsa del record (che dipendeva dal timing della delete lato chiudente).
              if (match.ended_at) {
                if (match.ended_by && match.ended_by !== sessionId) setPartnerDisconnected(true);
                setSessionEnded(true);
                setShowResult(false);
                setWaitingForPartner(false);
                return;
              }

              // Cattura user1_id (= primo chooser del cambio-modalità a turni) appena disponibile.
              if (match.user1_id) setMatchUser1Id(match.user1_id);

              // Risultato round — processa solo se è un round nuovo (round_count avanzato)
              const dbRound = match.round_count || 0;
              if (match.sender_symbol && match.receiver_guess && dbRound > lastProcessedRoundRef.current) {
                lastProcessedRoundRef.current = dbRound;
                const isTelepathicMatch = match.sender_symbol === match.receiver_guess;
                setPartnerSymbol(effectiveRole === 'sender' ? match.receiver_guess : match.sender_symbol);
                setIsMatch(isTelepathicMatch);
                setShowResult(true);
                setWaitingForPartner(false);

                // Indagine: il RICEVENTE registra il tentativo in telepathy_trials (append-only).
                // receiver_id = identità affidabile del percipiente: email se iscritto, altrimenti
                // il codice ospite leggibile/stabile (Fase 3, es. 'aurora-lince-72'), non il
                // sessionId effimero. sender_id = session_id del partner (presenza): è solo un'etichetta
                // di coppia, NON un'identità affidabile (mai un'email anche se il sender è iscritto).
                // Niente fallback a user1_id: quando il ricevente locale È user1 finirebbe per
                // registrare se stesso come sender (dato sporco). Un solo lato scrive (il ricevente)
                // per non duplicare. Best-effort: un trial perso non è un errore per l'utente.
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
                  }).then(({ error }) => { if (error) console.warn('log_telepathy_trial failed', error); }).catch(() => {});
                }
                // Congela ruolo+livello PRIMA dell'incremento di roundCount (che inverte
                // effectiveRole ogni 3 round): il recap userà questi, non i valori live.
                setResultRole(effectiveRole);
                setResultLevel(currentLevel);

                const newRound = (match.round_count || 0) + 1;
                const newSessionMatches = sessionMatchesRef.current + (isTelepathicMatch ? 1 : 0);
                setRoundCount(newRound);
                setSessionMatches(newSessionMatches);

                // Avviso cambio-ruolo: ora DERIVATO nel render in base a roundCount (mostrato
                // all'inizio del nuovo blocco, durante il picker), così è ben visibile e non
                // lampeggia durante la schermata del risultato.

                // Solo il sender esegue la write al DB per evitare doppia scrittura.
                // Aspetta 4s prima di cancellare i simboli, cosi' il receiver ha tempo
                // di pollare e vedere il risultato (e il guard round_count funziona).
                if (effectiveRole === 'sender') {
                  setTimeout(async () => {
                    await supabase.from('telepathy_matches').update({
                      round_count: newRound,
                      sender_symbol: null,
                      receiver_guess: null,
                    }).eq('id', matchId);
                  }, 4000);
                }

                // Suggerisci cambio livello ogni 7 round
                if (newRound >= 7 && newRound % 7 === 0) {
                  setShowLevelBanner(true);
                  // showResult NON resettato qui: l'auto-avanzamento mostra il risultato del
                  // 7° round per ~4s e poi resetta showResult, lasciando apparire il banner
                  // (gated da !showResult, render ~4083).
                }
              }
            };

            pollResult();
            const interval = setInterval(pollResult, 2000);
            return () => clearInterval(interval);
          }, [matchId, waitingForPartner, role, effectiveRole, currentLevel]);

          // Overlay centrale "ruoli invertiti": all'inizio di un round multiplo di 3 (4°,7°,…)
          // i ruoli si scambiano → avviso grosso al centro schermo per ~2,2s (o tap per chiudere).
          useEffect(() => {
            if (partner && !sessionEnded && roundCount > 0 && roundCount % 3 === 0) {
              setRoleSwapOverlay(effectiveRole);
              const tmr = setTimeout(() => setRoleSwapOverlay(null), 2200);
              return () => clearTimeout(tmr);
            }
            setRoleSwapOverlay(null);
          }, [roundCount, partner, sessionEnded, effectiveRole]);

          // Rileva se il partner ha abbandonato la sessione:
          // 1. match eliminato (ha cliccato Termina o chiusura tab con sendBeacon)
          // 2. partner non visto da >35s in online_users (tab chiusa senza cleanup)
          useEffect(() => {
            if (!matchId) return;
            const checkPartnerLeft = async () => {
              // Evita di riprovare la select con ended_at/ended_by ad ogni tick (ogni 2s per
              // tutta la sessione) una volta appurato che le colonne non esistono ancora
              // (migration 14_ non applicata): raddoppierebbe inutilmente le richieste.
              let data, error;
              if (endedColumnsSupportedRef.current) {
                ({ data, error } = await supabase.from('telepathy_matches').select('id, ended_at, ended_by').eq('id', matchId));
                if (error) endedColumnsSupportedRef.current = false;
              }
              if (!endedColumnsSupportedRef.current) {
                ({ data } = await supabase.from('telepathy_matches').select('id').eq('id', matchId));
              }
              // Se il match e' cambiato mentre la select era in volo (es. Accept di un nuovo
              // invito da schermata "sessione conclusa": resetTelepathy azzera il match OLD e se
              // ne crea uno NUOVO), NON scrivere flag di fine sessione: apparterrebbero al match
              // vecchio ma colpirebbero la sessione nuova (race stale-write esposta da A5).
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
              // Controlla last_seen del partner. Non mentre chi ha accettato aspetta chi ha invitato:
              // quello è offline per definizione e l'attesa finirebbe dopo 35 s (spec §4.4).
              if (partner?.id && !attesaInvitanteRef.current) {
                const { data: pu } = await supabase.from('online_users').select('last_seen').eq('id', partner.id);
                if (pu && pu.length > 0) {
                  const stale = Date.now() - new Date(pu[0].last_seen).getTime() > 35000;
                  if (stale && matchIdRef.current === matchId) setPartnerDisconnected(true);
                }
              }
            };
            const interval = setInterval(checkPartnerLeft, 2000);
            return () => clearInterval(interval);
          }, [matchId, partner]);

          // Poll per il cambio livello (gira tra i round quando showLevelBanner è true)
          useEffect(() => {
            if (!matchId || !showLevelBanner) return;

            const pollLevelChange = async () => {
              // Read-only lato passivo: solo il chooser scrive (proposeLevelChange).
              const { data } = await supabase.from('telepathy_matches').select('*').eq('id', matchId);
              if (!data || data.length === 0) return;
              const match = data[0];
              if (match.user1_id) setMatchUser1Id(match.user1_id);

              // Il chooser ha scritto level + marcatore 'r'+bannerRound → applica e dismetti
              // (vale anche per "Resta così", dove level non cambia ma il marcatore sì).
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

          // Chi ha invitato entra SOLO nel match dell'invito accettato (spec §4.4): nessuna ricerca
          // di «un match qualunque in cui compaio». Id e nome del partner vengono dal match
          // (user2_*): chi invita non riceve mai il session_id dell'altro dalle RPC.
          const entraNelMatchDaInvito = async (idMatch) => {
            // Il client fatto a mano non solleva: un errore di rete torna in error. Non è «il
            // match non c'è più»: non si tocca niente e il giro fra 2 s riprova.
            const { data, error } = await supabase.from('telepathy_matches').select('*').eq('id', idMatch);
            if (error || !Array.isArray(data)) return null;   // null = non so (rete), false = non c'è
            const m = data[0];
            if (!m || m.ended_at) {
              setDirectInviteTarget(null);
              setInvitoInUscita(null);
              setAvvisoInviti(testoInviti('non_ce_piu'));
              return false;
            }
            // L'arrivo è un update del match: per il trigger della 32a vale come attività.
            await supabase.from('telepathy_matches').update({ round_count: m.round_count || 0 }).eq('id', m.id);
            const amUser1 = m.user1_id === sessionId;
            setPartner({ id: amUser1 ? m.user2_id : m.user1_id, nickname: amUser1 ? m.user2_nickname : m.user1_nickname });
            setRole(amUser1 ? m.user1_role : m.user2_role);
            setMatchId(m.id);
            setSessionEnded(false);
            setPartnerDisconnected(false);
            // Entrati nel match l'invito in uscita è chiuso: senza azzerarlo il ticchettio da 1 s
            // continuerebbe per tutto il training e resetTelepathy proverebbe un annullo inutile.
            setDirectInviteTarget(null);
            setInvitoInUscita(null);
            setActiveTab('telepathy');
            return true;
          };

          // L'invitante segue il suo invito dal server ogni 2 s. Il conto alla rovescia viene da
          // expires_at (45 s o 10 minuti): niente timer locale, resta giusto dopo una riapertura.
          // Il vecchio setTimeout di 45 s che cancellava l'invito non c'è più: a expires_at il
          // server risponde 'expired' (lo segna lui, anche se il cron è in ritardo) e il pulsante
          // torna libero da qui.
          useEffect(() => {
            if (!invitoInUscita || partner) return;
            let fermo = false;
            let inCorso = false;   // un giro lento non si sovrappone al successivo (niente doppio ingresso)
            const giro = async () => {
              if (inCorso) return;
              inCorso = true;
              try {
                const r = await rpcInviti('get_my_telepathy_invites', {});
                if (fermo || !r || !r.ok) return;
                if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
                const u = r.in_uscita;
                // Il mio invito non c'è più o non è più l'ultimo (le app vecchie cancellano gli
                // inviti ricevuti dopo 2 minuti, e allora in_uscita è uno più vecchio o nessuno):
                // si libera il pulsante e lo si dice, invece di restare appesi a un invito fantasma.
                if (!u || u.id !== invitoInUscita.id) {
                  setDirectInviteTarget(null);
                  setInvitoInUscita(null);
                  setAvvisoInviti(testoInviti('invito_sparito'));
                  return;
                }
                if (u.status === 'pending') { setInvitoInUscita(u); return; }
                if (u.status === 'accepted') {
                  if (u.match_id) { await entraNelMatchDaInvito(u.match_id); return; }
                  // Dalla 32b un'accettazione ha sempre il match_id (solo le RPC scrivono gli inviti).
                  // Se ne resta una vecchia senza, non c'è un training in cui entrare: si libera il
                  // pulsante invece di restare appesi per sempre.
                  setDirectInviteTarget(null);
                  setInvitoInUscita(null);
                  setAvvisoInviti(testoInviti('non_ce_piu'));
                  return;
                }
                setDirectInviteTarget(null);
                setInvitoInUscita(null);
                setAvvisoInviti(testoInviti(IH ? IH.motivoDaStato(u.status) : 'scaduto', { nome: u.nome }));
              } finally {
                inCorso = false;
              }
            };
            giro();
            const intervallo = setInterval(giro, 2000);
            return () => { fermo = true; clearInterval(intervallo); };
          }, [invitoInUscita && invitoInUscita.id, partner, sessionId, giroInviti]);

          // Rientro all'avvio: se il mio invito è stato accettato da meno di 3 minuti (ora del
          // server) con un match ancora vivo, ci entro; se è ancora aperto, riprendo l'attesa.
          // Una volta per identità: dopo un login il session_id cambia e gli inviti sono altri.
          const rientroFattoRef = React.useRef(null);
          useEffect(() => {
            if (!nickname || !sessionId || partner || rientroFattoRef.current === sessionId) return;
            rientroFattoRef.current = sessionId;
            const sid = sessionId;
            // Un errore di rete all'avvio non vuol dire «niente da riprendere»: si riprova ogni 2 s
            // per qualche giro, finché l'identità è la stessa e non si è già entrati in un match.
            const prova = async (restano) => {
              if (rientroFattoRef.current !== sid || matchIdRef.current) return;
              const riprova = () => { if (restano > 0) setTimeout(() => prova(restano - 1), 2000); };
              const r = await rpcInviti('get_my_telepathy_invites', {});
              if (!r || (r.ok === false && r.motivo === 'errore')) { riprova(); return; }
              if (!r.ok || !r.in_uscita || !IH) return;
              const scarto = IH.scarto(r.adesso, Date.now());
              setScartoOrologio(scarto);
              const u = r.in_uscita;
              if (u.status === 'pending') { setInvitoInUscita(u); setDirectInviteTarget({ id: null, nickname: u.nome }); return; }
              if (u.status === 'accepted' && u.match_id && !IH.attesaFinita(u.responded_at, scarto, Date.now())) {
                if ((await entraNelMatchDaInvito(u.match_id)) === null) riprova();
              }
            };
            prova(5);
          }, [nickname, sessionId]);

          // Chat in-match telepatia
          useEffect(() => {
            if (!matchId) return;
            const loadChat = async () => {
              const { data } = await supabase.from('telepathy_chat').select('*').eq('match_id', matchId).order('created_at', { ascending: true });
              if (data) setTelepathyChatMessages(data.filter(x => !isBlocked(x.sender_name)));
            };
            loadChat();
            const interval = setInterval(loadChat, 3000);
            return () => clearInterval(interval);
          }, [matchId]);

          // Receiver: controlla se il sender ha già inviato il simbolo DEL ROUND CORRENTE.
          useEffect(() => {
            if (!matchId || effectiveRole !== 'receiver' || waitingForPartner || showResult) return;

            const checkSenderSent = async () => {
              const { data } = await supabase.from('telepathy_matches').select('sender_symbol, round_count').eq('id', matchId);
              if (data && data.length > 0) {
                // A4/bug 4: un sender_symbol non-null vale come "inviato" SOLO se il round sul DB
                // combacia con il round locale. Dopo un risultato il receiver avanza subito a
                // round N+1, ma il vecchio simbolo (round N) resta sul DB finché il sender non
                // lo pulisce (fino a ~4s dopo, misurati sul SUO clock). Il sender scrive
                // round_count e sender_symbol=null nello stesso update (atomico), quindi un
                // simbolo vecchio coesiste sempre con round_count indietro: confrontare i round
                // evita di sbloccare la griglia leggendo il simbolo del round precedente
                // (race cross-client), senza dipendere da margini di timing.
                const dbRound = data[0].round_count || 0;
                setSenderHasSent(!!data[0].sender_symbol && dbRound === roundCount);
              }
            };

            checkSenderSent();
            const interval = setInterval(checkSenderSent, 2000);
            return () => clearInterval(interval);
          }, [matchId, role, effectiveRole, waitingForPartner, showResult, roundCount]);

          // Auto-avanzamento: dopo il risultato il gioco riparte da solo dopo 4s (no "Ancora").
          // 4s = combacia con la pulizia dei simboli (sender, ~2255). Bloccato se c'è il banner
          // cambio livello (richiede scelta), fine sessione o partner disconnesso.
          useEffect(() => {
            if (!showResult || sessionEnded || partnerDisconnected) {
              setResultCountdown(null);
              return;
            }
            setResultCountdown(4);
            const tick = setInterval(() => {
              setResultCountdown((c) => (c && c > 1) ? c - 1 : c);
            }, 1000);
            const advance = setTimeout(() => {
              setShowResult(false);
              setSelectedSymbol(null);
              setGuessedSymbol(null);
              setPartnerSymbol(null);
              setWaitingForPartner(false);
              setResultCountdown(null);
              // A4/bug 4: azzera anche senderHasSent, altrimenti a inizio nuovo round resta
              // `true` dal round precedente e la griglia del receiver è cliccabile finché il
              // polling (ogni 2s) non la corregge. Bloccata dal principio finché il sender invia.
              setSenderHasSent(false);
            }, 4500);  // dopo la scrittura round_count del sender (4s): evita la race
            return () => { clearInterval(tick); clearTimeout(advance); };
          }, [showResult, sessionEnded, partnerDisconnected]);

          const resetTelepathy = () => {
            // Se l'utente abbandona una sessione attiva (non terminata via endSession),
            // cancella match/queue/inviti per non lasciare il partner appeso
            // e per evitare di tornare in lobby ancora "in match" dal punto di vista DB.
            const oldMatchId = matchId;
            if (oldMatchId) {
              supabase.from('telepathy_matches').delete().eq('id', oldMatchId);
              supabase.from('telepathy_chat').delete().eq('match_id', oldMatchId);
            }
            if (sessionId) {
              supabase.from('telepathy_queue').delete().eq('id', sessionId);
            }
            // Uscire volontariamente dalla telepatia ritira l'invito in uscita; chiudere l'app no.
            const uscita = invitoInUscitaRef.current;
            if (uscita && uscita.status === 'pending') rpcInviti('cancel_telepathy_invite', { p_invite_id: uscita.id });
            // Il ref si svuota subito, non al render: «Gioca ancora» chiama sendDirectInvite
            // nello stesso giro e troverebbe ancora l'invito vecchio.
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
            // nuovi state v2
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

          // A2: uscita rapida anti-stallo, sempre disponibile nelle attese.
          // Diversa da endSession (chiusura graziosa con recap+punteggio): qui si abbandona
          // e si torna in lobby senza recap. Marca il flag ended (best-effort, no PII: session
          // token come in A1) cosi' l'altro lato esce anche lui via polling; resetTelepathy
          // resta il fallback affidabile (cancella il match -> l'altro rileva partner uscito).
          const leaveSession = async () => {
            // I round gia' giocati sono avvenuti davvero: come endSession, persistili nel
            // contatore autoritativo (increment_telepathy_score) prima di uscire, cosi' uscire
            // per stallo non fa perdere statistiche legittime. "Senza recap" != "senza salvare".
            if (roundCount > 0) {
              try {
                await supabase.rpc('increment_telepathy_score', {
                  p_user_id: userEmail || sessionId,
                  p_nickname: nickname || 'Anonymous',
                  p_rounds: roundCount,
                  p_matches: sessionMatches
                });
              } catch (e) { /* best-effort: non bloccare l'uscita se il salvataggio fallisce */ }
            }
            if (matchId) {
              try { await supabase.rpc('end_telepathy_match', { p_match_id: matchId, p_ended_by: sessionId }); }
              catch (e) { /* RPC/colonne non ancora applicate: resetTelepathy cancella comunque il match */ }
            }
            resetTelepathy();
          };

          // A3: auto-timeout di inattività (bug desync/stallo). Arma un timer di 90s SOLO
          // quando si è realmente in attesa dell'azione del partner (non nel proprio turno,
          // per non buttare fuori chi sta riflettendo). Ogni progresso cambia una dep →
          // l'effetto si ri-arma; 90s di attesa continua senza progressi → leaveSession
          // (che, con A1, fa uscire dalla sessione anche il partner via flag/rilevamento).
          useEffect(() => {
            // Nell'attesa di chi ha invitato (fino a 3 minuti) il timeout A3 non parte.
            const waitingOnPartner = !!matchId && !attesaInvitante && !sessionEnded && !partnerDisconnected && !showResult
              && (waitingForPartner || (showLevelBanner && !amIChooser) || (effectiveRole === 'receiver' && !senderHasSent));
            if (!waitingOnPartner) return;
            const timer = setTimeout(() => { leaveSession(); }, 90000);
            return () => clearTimeout(timer);
          }, [matchId, sessionEnded, partnerDisconnected, showResult, waitingForPartner, showLevelBanner, amIChooser, effectiveRole, senderHasSent, roundCount, sessionMatches, attesaInvitante]);

          // Una sola strada per ogni invito, anche verso chi è online: send_telepathy_invite
          // controlla identità, blocchi nei due sensi, tetti e disponibilità, scrive l'invito e la
          // notifica della campanella, e chiede la push. target: { id, nickname } dalla lista
          // Online oppure { disponibilita_id, nickname } dalla lista «Disponibili su invito».
          // Un secondo tocco su «Proponi» prima del nuovo render manderebbe una seconda RPC (e un
          // confuso «Hai già un invito in corso»): si ignora, come per «Accetta».
          const invioInCorsoRef = React.useRef(false);
          const sendDirectInvite = async (targetUser) => {
            if (directInviteTarget || invitoInUscitaRef.current || invioInCorsoRef.current) return;
            invioInCorsoRef.current = true;
            try { await inviaInvito(targetUser); } finally { invioInCorsoRef.current = false; }
          };
          const inviaInvito = async (targetUser) => {
            setDirectInviteTarget(targetUser);
            const r = await rpcInviti('send_telepathy_invite', {
              p_nickname: nickname || 'Anonymous',
              p_disponibilita_id: targetUser.disponibilita_id || null,
              p_session_online: targetUser.disponibilita_id ? null : targetUser.id
            });
            if (!r || !r.ok) {
              setDirectInviteTarget(null);
              setAvvisoInviti(testoInviti((r && r.motivo) || 'errore', { nome: targetUser.nickname }));
              return;
            }
            if (IH) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
            setAdessoLocale(Date.now()); // nello stesso render dell'invito: niente primo conto sbagliato
            setInvitoInUscita({ id: r.id, nome: targetUser.nickname, status: 'pending', expires_at: r.expires_at,
                                created_at: r.created_at, push_saltata: r.push_saltata, match_id: null, responded_at: null });
            if (r.push_saltata) setAvvisoInviti(testoInviti('push_saltata'));
          };

          // «Annulla»: libera il pulsante e ritira l'invito sul server.
          const cancelDirectInvite = async () => {
            const uscita = invitoInUscitaRef.current;
            setDirectInviteTarget(null);
            setInvitoInUscita(null);
            if (uscita) await rpcInviti('cancel_telepathy_invite', { p_invite_id: uscita.id });
          };

          // Un secondo tocco su «Accetta» mentre il primo è in volo creerebbe un secondo match
          // (o un falso «già accettato»): si ignora.
          const accettoInCorsoRef = React.useRef(false);
          const acceptInvite = async () => {
            if (!incomingInvite || accettoInCorsoRef.current) return;
            accettoInCorsoRef.current = true;
            try { await accettaInvito(); } finally { accettoInCorsoRef.current = false; }
          };
          const accettaInvito = async () => {
            // Durante un training non si accetta (il server risponderebbe in_match): la UI mostra
            // solo «Rifiuta». Dalla schermata «sessione conclusa» (sessionEnded) o con il partner
            // uscito si può: bug 2, `partner` resta valorizzato anche a sessione finita.
            if ((matchId || partner) && !sessionEnded && !partnerDisconnected) return;
            // Sessione precedente conclusa/abbandonata: reset completo prima di entrare nella nuova.
            if (matchId || partner) resetTelepathy();
            // Anticipare setSearchingPartner(false) per evitare che findPartner crei un altro match
            // in parallelo durante l'await dell'INSERT (race con random matching).
            setSearchingPartner(false);
            const invito = incomingInvite;
            // Residui conclusi della stessa coppia: farebbero fallire l'insert sul vincolo
            // telepathy_matches_pair_unique (409). Filtro lato client (select + delete per id):
            // il client fatto a mano conosce solo .eq/.neq/.lt, NON .not.
            const { data: staleAccept } = await supabase.from('telepathy_matches').select('*');
            for (const m of (staleAccept || [])) {
              const isPair = (m.user1_id === invito.from_id && m.user2_id === sessionId) || (m.user1_id === sessionId && m.user2_id === invito.from_id);
              if (isPair && m.ended_at) await supabase.from('telepathy_matches').delete().eq('id', m.id);
            }
            const myRole = Math.random() > 0.5 ? 'sender' : 'receiver';
            const theirRole = myRole === 'sender' ? 'receiver' : 'sender';
            // Prima il match (come oggi, fuori scope rifarlo), segnato da_invito: così, se l'app si
            // chiude prima della risposta, findPartner riconosce l'orfano e non ci risucchia nessuno.
            const { data: matchData, error: matchError } = await supabase.from('telepathy_matches').insert({
              user1_id: invito.from_id,
              user1_nickname: invito.from_name,
              user1_role: theirRole,
              user2_id: sessionId,
              user2_nickname: nickname || 'Anonymous',
              user2_role: myRole,
              level: 'lvl3', // ogni sessione parte dal livello più facile (3 card)
              round_count: 0,
              da_invito: true
            });
            if (matchError || !matchData || matchData.length === 0) {
              // Di solito: la stessa persona ha appena accettato da un altro telefono o un'altra
              // scheda, e il match della coppia esiste già (vincolo pair_unique). Si chiede al
              // server com'è l'invito, per dire il motivo vero («già accettato»).
              const stato = await rpcInviti('get_telepathy_invite', { p_invite_id: invito.invite_id });
              let motivo = 'match_non_valido';
              if (stato && stato.ok && stato.invito && stato.invito.status !== 'pending' && IH) motivo = IH.motivoDaStato(stato.invito.status);
              else if (stato && stato.ok === false && (stato.motivo === 'errore' || stato.motivo === 'auth_fallita')) motivo = stato.motivo;
              setIncomingInvite(null);
              setAvvisoInviti(testoInviti(motivo, { nome: invito.from_name }));
              return;
            }
            const nuovo = matchData[0];
            // Poi la risposta: controlla scadenza, coppia, training in corso, e chi ha già risposto.
            let r = await rpcInviti('respond_telepathy_invite', { p_invite_id: invito.invite_id, p_accept: true, p_match_id: nuovo.id });
            if (r && r.ok === false && r.motivo === 'errore') {
              // Errore di rete: la risposta può essere arrivata al server anche se non a noi.
              // Prima di cancellare il match si chiede com'è andata (un errore non vale «rifiutato»).
              const stato = await rpcInviti('get_telepathy_invite', { p_invite_id: invito.invite_id });
              if (stato && stato.ok && stato.invito && stato.invito.status === 'accepted' && stato.invito.match_id === nuovo.id) {
                r = { ok: true, status: 'accepted', responded_at: stato.invito.responded_at, adesso: stato.adesso };
              }
            }
            if (!r || !r.ok) {
              // Rifiutato dal server (scaduto, annullato, già accettato da un altro telefono,
              // in_match): il match appena creato non deve restare a nessuno.
              await supabase.from('telepathy_matches').delete().eq('id', nuovo.id);
              setIncomingInvite(null);
              setAvvisoInviti(testoInviti((r && r.motivo) || 'errore', { nome: invito.from_name }));
              return;
            }
            if (IH && r.adesso) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
            // Il mio invito in uscita, se c'era, l'ha annullato il server accettando (ruling m4):
            // lo si toglie anche qui, senza annullarlo di nuovo (il ref subito, come in resetTelepathy).
            invitoInUscitaRef.current = null;
            setInvitoInUscita(null);
            setDirectInviteTarget(null);
            setMatchId(nuovo.id);
            setPartner({ id: invito.from_id, nickname: invito.from_name });
            setRole(myRole);
            setIncomingInvite(null);
            // Chi ha invitato può essere offline: si aspetta fino a 3 minuti da responded_at.
            setAttesaInvitante({ invitoId: invito.invite_id, respondedAt: r.responded_at, nome: invito.from_name });
            setSessionEnded(false);
            setPartnerDisconnected(false);
            setShowResult(false);
            setSelectedSymbol(null);
            setGuessedSymbol(null);
            setPartnerSymbol(null);
            setWaitingForPartner(false);
            setSenderHasSent(false); // A4: la griglia receiver parte bloccata finché il sender non invia
            setRoundCount(0);
            setSessionMatches(0);
            setActiveTab('telepathy');
          };

          // Rifiutare: stato e notifica al mittente li scrive la RPC (e la push, per un invito da 10 minuti).
          const declineInvite = async () => {
            const invito = incomingInvite;
            if (!invito) return;
            setIncomingInvite(null);
            const r = await rpcInviti('respond_telepathy_invite', { p_invite_id: invito.invite_id, p_accept: false, p_match_id: null });
            if (r && r.ok === false && r.motivo !== 'scaduto') setAvvisoInviti(testoInviti(r.motivo, { nome: invito.from_name }));
          };

          // Chi ha accettato aspetta chi ha invitato (spesso offline, arriva dalla notifica) al
          // massimo 3 minuti da responded_at, riletto dal server a ogni giro: una riapertura non
          // riparte da zero e un test può spostarlo. L'attesa finisce appena l'altro compare in
          // online_users (30 s) oppure il match risulta giocato (ruling M2: l'arrivo di chi ha
          // invitato è un update del match; così un orologio sfasato non chiude un training vero).
          // Poi tornano i controlli normali. Un errore di rete non chiude niente: si riprova.
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
                const { data: pu } = await supabase.from('online_users').select('last_seen').eq('id', partner.id);
                if (fermo) return;
                // Conta solo una presenza vista DOPO l'accettazione (+5 s di margine): chi posa il
                // telefono lascia la sua riga fresca per un po' (niente la cancella quando lo schermo
                // si blocca), e quella riga non vuol dire «è arrivato». last_seen lo scrive l'orologio
                // di chi ha invitato: nel dubbio si aspetta; l'uscita sicura resta giocato (M2).
                const visto = pu && pu.length > 0 ? Date.parse(pu[0].last_seen) : NaN;
                const risposto = Date.parse(rispostoIlRef.current);
                if (!isNaN(visto) && !isNaN(risposto) && visto > risposto + 5000
                    && Date.now() - visto < 30000) { setAttesaInvitante(null); return; }
                const { data: mm, error: errM } = await supabase.from('telepathy_matches').select('giocato').eq('id', matchId);
                if (fermo) return;
                if (!errM && Array.isArray(mm) && mm.length > 0 && mm[0].giocato === true) { setAttesaInvitante(null); return; }
                const r = await rpcInviti('get_telepathy_invite', { p_invite_id: attesaInvitante.invitoId });
                if (fermo) return;
                const scarto = r && r.adesso && IH ? IH.scarto(r.adesso, Date.now()) : scartoOrologio;
                if (r && r.ok && r.invito && r.invito.responded_at) rispostoIlRef.current = r.invito.responded_at;
                if (IH && IH.attesaFinita(rispostoIlRef.current, scarto, Date.now())) {
                  fermo = true;
                  try { await supabase.rpc('end_telepathy_match', { p_match_id: matchId, p_ended_by: sessionId }); } catch (_) {}
                  const nome = attesaInvitante.nome;
                  resetTelepathy();
                  setAvvisoInviti(testoInviti('non_arrivato', { nome }));
                }
              } finally { inCorso = false; }
            };
            giro();
            const intervallo = setInterval(giro, 2000);
            return () => { fermo = true; clearInterval(intervallo); };
          }, [attesaInvitante && attesaInvitante.invitoId, matchId, partner]);

          // Aprire un invito (da ?invito= o dal messaggio del service worker): get_telepathy_invite
          // dice di chi è e in che stato; IH.esitoApertura sceglie cosa mostrare. Mai una
          // schermata vuota: anche un browser senza l'identità del destinatario, dopo l'entrata
          // come ospite, legge «Invito non trovato su questo dispositivo».
          useEffect(() => {
            if (!invitoDaAprire || !nickname || !sessionId || !IH) return;
            const { invito, azione } = invitoDaAprire;
            setInvitoDaAprire(null);
            (async () => {
              setActiveTab('telepathy');
              if (!invito) { setAvvisoInviti(testoInviti('non_trovato')); return; }
              const r = await rpcInviti('get_telepathy_invite', { p_invite_id: invito });
              // Un errore (rete, Auth failed) non vale «l'invito non c'è»: si dice l'errore. Se
              // l'invito è aperto, il giro delle presenze lo mostra comunque fra pochi secondi.
              if (r && r.ok === false && (r.motivo === 'errore' || r.motivo === 'auth_fallita')) {
                setAvvisoInviti(testoInviti(r.motivo));
                return;
              }
              if (r && r.adesso) setScartoOrologio(IH.scarto(r.adesso, Date.now()));
              const esito = IH.esitoApertura(r, azione);
              if (esito.tipo === 'conferma_blocco') { setConfermaBlocco({ nome: esito.nome, p_invite_id: invito, daNotifica: true }); return; }
              if (esito.tipo === 'rispondi') {
                // Durante un training il render mostra solo «Rifiuta» (invito-durante-training).
                setIncomingInvite({ from_id: r.invito.from_id, from_name: r.invito.nome, invite_id: r.invito.id, expires_at: r.invito.expires_at });
                return;
              }
              if (esito.tipo === 'entra') { await entraNelMatchDaInvito(esito.matchId); return; }
              if (esito.tipo === 'attesa') {
                setInvitoInUscita(r.invito);
                setDirectInviteTarget({ id: null, nickname: r.invito.nome });
                return;
              }
              setAvvisoInviti(testoInviti(esito.motivo, { nome: esito.nome }));
            })();
          }, [invitoDaAprire, nickname, sessionId]);

          // «Non voglio più inviti da questa persona»: blocco lato server per session_id, nei due
          // sensi, anche per gli ospiti. Il service worker non lo fa mai da sé: passa sempre di qui.
          // «non_trovato» dice «Invito non trovato su questo dispositivo» solo arrivando da una
          // notifica; dal banner (e dalla scheda, Task 22) vuol dire che la persona non è più
          // raggiungibile (ruling m5).
          const confermaBloccoInviti = async () => {
            const c = confermaBlocco;
            if (!c) return;
            setConfermaBlocco(null);
            setSchedaInvito(null);
            const { nome, daNotifica, ...chi } = c;
            const r = await rpcInviti('block_telepathy_inviter', { p_invite_id: null, p_disponibilita_id: null, p_session_online: null, ...chi });
            if (!r || !r.ok) {
              const motivo = (r && r.motivo) || 'errore';
              setAvvisoInviti(testoInviti(motivo === 'non_trovato' && !daNotifica ? 'non_trovato_scheda' : motivo));
              return;
            }
            // Il server ha già chiuso gli inviti aperti fra i due: sparisce il banner di quella
            // persona (non quello di un'altra, se nel frattempo ne è arrivato uno).
            setIncomingInvite((x) => (x && (x.invite_id === chi.p_invite_id || x.from_name === (r.nome || nome)) ? null : x));
            setAvvisoInviti(testoInviti('bloccato_ok', { nome: r.nome || nome }));
          };

          const [disponibileInviti, setDisponibileInviti] = useState(null); // null = non ancora chiesto al server
          const [invitabili, setInvitabili] = useState([]);                 // get_invitable_users: [{ id (opaco), nickname }]
          const [schedaInvito, setSchedaInvito] = useState(null);           // { chi, dati }
          const ultimoRinnovoRef = React.useRef(0);

          // Lo stato dell'interruttore lo decide il server, non localStorage: un altro telefono che
          // l'ha spento vince sul rinnovo di questo. Con «senza_abbonamento» si prova una volta a
          // riregistrare l'abbonamento (se il permesso c'è ancora) e a rinnovare — ma non se la
          // persona ha spento le notifiche dei rituali: l'abbonamento è uno solo per telefono, e
          // quella scelta non si annulla da sola (ruling M4).
          // Si rinnova anche quando la PWA torna dal background (ruling m11): su un telefono l'app
          // resta aperta per giorni senza mai ripartire, e dopo 14 giorni uscirebbe dalla lista.
          // Al massimo una volta all'ora.
          useEffect(() => {
            // Cambio d'identità (logout, ospite → account): niente stato né scheda della persona di prima.
            setSchedaInvito(null);
            if (!nickname || !sessionId) { setDisponibileInviti(null); setInvitabili([]); return; }
            let fermo = false;
            const rinnova = async () => {
              ultimoRinnovoRef.current = Date.now();
              let r = await rpcInviti('renew_telepathy_availability', {});
              if (fermo || !r || !r.ok) return;
              if (r.stato === 'senza_abbonamento' && pushDisponibile() && Notification.permission === 'granted'
                  && localStorage.getItem('ga_push_spento') !== '1') {
                try { await iscriviPush(); r = await rpcInviti('renew_telepathy_availability', {}); } catch (_) {}
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
            return () => { fermo = true; document.removeEventListener('visibilitychange', alRitorno); };
          }, [nickname, sessionId]);

          // Accendere: il tocco sull'interruttore, con la frase accanto, è la nostra domanda; da
          // qui parte il permesso del browser, poi l'abbonamento (lo stesso dei rituali: riaccende
          // anche quelle notifiche, decisione di Irene del 01/10), poi la disponibilità. Se
          // qualcosa non va, l'interruttore resta spento e lo dice: niente verde finto (rilievo
          // della review del 21/09).
          const accendiDisponibilita = async () => {
            if (!pushDisponibile()) {
              const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
              const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
              setDisponibileInviti(false);
              // Su iPhone non installata il popup «Aggiungi a Home» spiega già cosa fare.
              if (iOS && !installata) setMostraInstallaPerPush(true);
              else setAvvisoInviti(testoInviti('push_non_supportata'));
              return;
            }
            try {
              if (Notification.permission !== 'granted') {
                const p = await Notification.requestPermission();
                if (p !== 'granted') { setDisponibileInviti(false); setAvvisoInviti(testoInviti('permesso_negato')); return; }
              }
              await iscriviPush();
            } catch (_) {
              setDisponibileInviti(false);
              setAvvisoInviti(testoInviti('errore'));
              return;
            }
            const r = await rpcInviti('set_telepathy_availability', { p_nickname: nickname || 'Anonymous', p_enabled: true });
            const ok = !!(r && r.ok && r.acceso);
            setDisponibileInviti(ok);
            if (!ok) setAvvisoInviti(testoInviti((r && r.motivo) || 'errore'));
          };
          // Spegnere toglie la riga, non l'abbonamento: le notifiche dei rituali restano.
          const spegniDisponibilita = async () => {
            const r = await rpcInviti('set_telepathy_availability', { p_nickname: nickname || 'Anonymous', p_enabled: false });
            if (r && r.ok) setDisponibileInviti(false); else setAvvisoInviti(testoInviti('errore'));
          };
          // Prima di un cambio d'identità (iscrizione, login, link magico, logout) si spegne la
          // disponibilità del session_id che se ne va: altrimenti resterebbe in lista una persona
          // che su questo telefono non riceve più niente (spec §4.4). sid e credenziale si passano
          // espliciti: rpcInviti leggerebbe i riferimenti, che a quel punto possono essere già del nuovo.
          // Si salta solo se il server ha già detto «spento»: con null (risposta non ancora
          // arrivata, o il link magico letto alla prima apertura) si spegne lo stesso, costa poco.
          const spegniDisponibilitaDi = async (sid, hash) => {
            if (disponibileInviti === false || !sid) return;
            try { await supabase.rpc('set_telepathy_availability', { p_session_id: sid, p_password_hash: hash || null, p_nickname: null, p_enabled: false }); } catch (_) {}
            setDisponibileInviti(false);
          };
          const renderInterruttoreInviti = (dataTest) => (
            <div style={{padding: '0.5rem 0'}}>
              <div className="flex items-center justify-between" style={{gap: '0.75rem'}}>
                <span className="text-white text-sm">{testoInviti('interruttore')}</span>
                <button data-test={dataTest} role="switch" aria-checked={disponibileInviti === true}
                  aria-label={testoInviti('interruttore')}
                  onClick={() => (disponibileInviti ? spegniDisponibilita() : accendiDisponibilita())}
                  style={{width: '3rem', height: '1.5rem', flexShrink: 0, borderRadius: '9999px', position: 'relative', cursor: 'pointer', transition: 'all 0.3s',
                    background: disponibileInviti ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.2)',
                    border: disponibileInviti ? '1px solid rgba(34,197,94,0.7)' : '1px solid rgba(255,255,255,0.3)'}}>
                  <div style={{width: '1.1rem', height: '1.1rem', borderRadius: '50%', background: '#fff', position: 'absolute', top: '50%',
                    transform: 'translateY(-50%)', left: disponibileInviti ? 'calc(100% - 1.3rem)' : '0.15rem', transition: 'all 0.3s'}} />
                </button>
              </div>
              <p className="text-secondary text-xs" style={{marginTop: '0.25rem'}}>{testoInviti('nota_nome')}</p>
            </div>
          );

          // La lista, finché si è nella lobby della telepatia.
          useEffect(() => {
            if (activeTab !== 'telepathy' || partner || !nickname || !sessionId) return;
            let fermo = false;
            const giro = async () => {
              const r = await rpcInviti('get_invitable_users', { p_nickname: nickname || 'Anonymous' });
              if (!fermo && Array.isArray(r)) setInvitabili(r);
            };
            giro();
            const intervallo = setInterval(giro, 15000);
            return () => { fermo = true; clearInterval(intervallo); };
          }, [activeTab, partner, nickname, sessionId]);

          // La scheda: dalla lista «Disponibili su invito» ({ disponibilita_id, nickname }) o dalla
          // lista Online ({ id: session_id, nickname }). Nessun session_id torna dal server.
          const apriScheda = async (chi) => {
            const r = await rpcInviti('get_invite_card', {
              p_nickname: nickname || 'Anonymous',
              p_disponibilita_id: chi.disponibilita_id || null,
              p_session_online: chi.disponibilita_id ? null : chi.id
            });
            if (!r || !r.ok) { setAvvisoInviti(testoInviti(r && r.motivo === 'non_trovato' ? 'non_disponibile' : ((r && r.motivo) || 'errore'))); return; }
            setSchedaInvito({ chi, dati: r.scheda });
          };
          // Ruling m10: la lista Online dell'app tiene chi è stato visto negli ultimi 2 minuti, il
          // server solo negli ultimi 30 s. Fra 30 s e 2 minuti chi ha l'interruttore acceso sta già
          // in «Disponibili su invito» (con l'invito da 10 minuti e la push): lì soltanto, non due volte.
          // Si toglie solo chi non si vede da almeno 30 s: chi è attivo resta in Online anche se
          // qualcun altro con lo stesso nome è fra i disponibili.
          const onlineInLobby = onlineUsersForTelepathy.filter((u) => {
            const visto = Date.parse(u.last_seen);
            const recente = !isNaN(visto) && Date.now() - visto < 30000;
            return recente || !invitabili.some((d) => d.nickname === u.nickname);
          });

          const playAgainSamePartner = async () => {
            const savedPartner = partner;
            if (!savedPartner) return;
            // Stessa soglia del server (30 s): non si promette un invito che verrebbe rifiutato.
            const { data: presence } = await supabase.from('online_users').select('id,last_seen').eq('id', savedPartner.id);
            const stillOnline = presence && presence.length > 0 &&
              (Date.now() - new Date(presence[0].last_seen).getTime() < 30000);
            if (!stillOnline) {
              alert(t.telepathy.partnerOfflineN(savedPartner.nickname));
              return;
            }
            // Prima si chiude il match appena finito, ASPETTANDO la risposta: la cancellazione di
            // resetTelepathy parte senza attesa, e un match giocato da meno di 10 minuti senza
            // ended_at farebbe rispondere al server in_match / non_disponibile.
            if (matchId) {
              try { await supabase.rpc('end_telepathy_match', { p_match_id: matchId, p_ended_by: sessionId }); } catch (_) {}
            }
            resetTelepathy();
            await sendDirectInvite({ id: savedPartner.id, nickname: savedPartner.nickname });
          };

          // Load profile from Supabase or localStorage
          useEffect(() => {
            const loadProfile = async () => {
              try {
                const { data } = await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('session_id', sessionId);
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
              // Fallback to localStorage
              const local = localStorage.getItem('ga_profile');
              if (local) {
                try { setProfile(JSON.parse(local)); } catch(e) {}
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
            // I totali possono arrivare da localStorage (stringhe) o da un giro precedente:
            // update_my_profile rifiuta con dati_non_validi se non sono interi JSON.
            const roundsInt = Math.max(0, Math.floor(Number(totalRounds) || 0));
            const matchesInt = Math.max(0, Math.floor(Number(totalMatches) || 0));
            const { data: esito, error } = await supabase.rpc('update_my_profile', {
              p_nickname: nickname, p_password_hash: passwordHash,
              p_fields: {
                bio: profile.bio || '', starseed_type: profile.starseedType || '', avatar: profile.avatar || '',
                country: profile.country || '', interests: profile.interests || [],
                experience_level: profile.experienceLevel || '',
                telepathy_score: roundsInt, telepathy_best: matchesInt,
                show_telepathy_score: showTelepathyScore !== false
              }
            });
            if (esito && esito.motivo === 'credenziali_non_valide') { segnalaChiaveScaduta(); return; }
            if (error || !esito || !esito.ok) {
              // Prima l'upsert falliva in silenzio e lo schermo diceva «salvato» lo stesso.
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
            // Idempotente: doppio click / re-trigger non somma due volte i round della sessione
            if (sessionEnded) return;
            setSessionEnded(true);
            // Nasconde subito la schermata showResult (con bottoni "Ancora" e "Termina Sessione")
            // per chi ha cliccato — altrimenti convivono con la schermata "Sessione Completata".
            setShowResult(false);
            setWaitingForPartner(false);
            try {
              const userId = userEmail || sessionId;
              // Increment atomico server-side via RPC (SECURITY DEFINER): elimina la race
              // del precedente read-modify-write quando lo stesso utente apre 2 tab e
              // chiude la sessione contemporaneamente. Niente piu' upsert diretto.
              const { error: rpcErr } = await supabase.rpc('increment_telepathy_score', {
                p_user_id: userId,
                p_nickname: nickname || 'Anonymous',
                p_rounds: roundCount,
                p_matches: sessionMatches
              });
              if (rpcErr) console.warn('increment_telepathy_score failed', rpcErr);
              // Rilegge i totali autorevoli per aggiornare UI/localStorage/profile.
              const { data: updated } = await supabase.rpc('get_my_telepathy_totals', { p_user_id: userId, p_password_hash: passwordHash });
              const newRounds = (updated && updated[0]) ? (updated[0].rounds_count || 0) : (totalRounds + roundCount);
              const newMatches = (updated && updated[0]) ? (updated[0].matches_count || 0) : (totalMatches + sessionMatches);
              setTotalRounds(newRounds);
              setTotalMatches(newMatches);
              localStorage.setItem('telepathy_score', String(newRounds));
              localStorage.setItem('telepathy_best', String(newMatches));
              // Oggi l'update girava anche per gli ospiti, che non hanno riga: non scriveva
              // niente. Ora non parte proprio, evitando una RPC destinata a fallire.
              if (!isGuest && nickname && passwordHash) {
                await supabase.rpc('update_my_profile', {
                  p_nickname: nickname, p_password_hash: passwordHash,
                  p_fields: { telepathy_score: newRounds, telepathy_best: newMatches }
                });
              }
              if (matchId) {
                // Marca il flag di fine sessione PRIMA di cancellare, cosi' l'altro lato
                // lo rileva via polling in modo deterministico (vedi pollResult/checkPartnerLeft).
                // Best-effort: se la RPC/colonne non sono ancora applicate su Supabase, degrada
                // in sicurezza sul vecchio comportamento (delete immediata sotto).
                let flagSet = false;
                try {
                  const { error: endErr } = await supabase.rpc('end_telepathy_match', { p_match_id: matchId, p_ended_by: sessionId });
                  flagSet = !endErr;
                } catch (e) { /* RPC non ancora applicata: si continua col vecchio path (delete) */ }
                // Cancella subito la chat per non lasciare messaggi orfani in telepathy_chat
                // (la tabella non ha ON DELETE CASCADE).
                await supabase.from('telepathy_chat').delete().eq('match_id', matchId);
                if (flagSet) {
                  // Il flag e' stato scritto con successo: ritarda la delete del match cosi'
                  // l'altro lato fa in tempo a leggere ended_at nel polling (2s) prima del cleanup.
                  setTimeout(() => { supabase.from('telepathy_matches').delete().eq('id', matchId); }, 6000);
                } else {
                  // Migration non applicata: nessuno potra' mai leggere il flag, quindi ritardare
                  // la delete non avrebbe alcun beneficio e introdurrebbe solo il rischio che il
                  // timer non arrivi mai a compimento (es. tab in background/throttled dal
                  // browser) lasciando il record orfano. Si mantiene il comportamento pre-A1.
                  await supabase.from('telepathy_matches').delete().eq('id', matchId);
                }
              }
            } catch (err) {
              console.warn('endSession error:', err);
            } finally {
              setMatchId(null); // ferma checkPartnerLeft per non sovrascrivere la schermata
            }
          };

          const toggleInterest = (key) => {
            setProfile(prev => ({
              ...prev,
              interests: prev.interests.includes(key)
                ? prev.interests.filter(i => i !== key)
                : [...prev.interests, key]
            }));
          };

          const openProfile = async (userName) => {
            try {
              markAsRead(userName);
              const { data } = await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('nickname', userName);
              if (data && data.length > 0) {
                const p = data[0];
                // B1: le stats vengono dalla fonte unica telepathy_scores via RPC pubblica
                // (SECURITY DEFINER, nessuna PII), NON da profiles.telepathy_score/best —
                // storicamente desincronizzati (l'update su profiles in endSession è una
                // scrittura separata dall'RPC increment_telepathy_score, può restare indietro).
                // Fallback ai vecchi campi solo se la RPC non è ancora applicata (migration 15_).
                let rounds = 0, matches = 0;
                try {
                  const { data: st } = await supabase.rpc('get_public_telepathy_stats', { p_nickname: userName });
                  if (st && st.length > 0) { rounds = st[0].rounds_count || 0; matches = st[0].matches_count || 0; }
                } catch (e) { /* RPC non applicata: fallback sotto */ }
                setViewingProfile({
                  nickname: p.nickname || userName || 'Anonymous',
                  bio: p.bio || '',
                  starseedType: p.starseed_type || '',
                  avatar: p.avatar || '',
                  country: p.country || '',
                  interests: p.interests || [],
                  experienceLevel: p.experience_level || '',
                  telepathyRounds: rounds || (p.telepathy_score || 0),
                  telepathyMatches: matches || (p.telepathy_best || 0),
                  showTelepathyScore: p.show_telepathy_score !== false,
                  // Registrato = ha una riga in profiles. È la stessa condizione che
                  // get_my_messages richiede per LEGGERE i messaggi: se non ce l'ha,
                  // non potrebbe comunque riceverli (i guest non salvano su profiles).
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

          // Load private messages (registered-only, Step B: lettura via RPC autenticata)
          useEffect(() => {
            if (!nickname || isGuest || !passwordHash) {
              setPrivateMessages([]);
              setUnreadCount(0);
              return;
            }
            const loadMessages = async () => {
              const { data, error } = await supabase.rpc('get_my_messages', {
                p_nickname: nickname,
                p_password_hash: passwordHash
              });
              if (eChiaveScaduta(error)) { segnalaChiaveScaduta(); return; }
              if (error || !Array.isArray(data)) return;  // rete: non tocca lo stato
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
              const { data } = await supabase.from('notifications').select('*')
                .eq('user_nickname', nickname).eq('read', false).order('created_at', { ascending: false });
              if (data) setNotifItems(data);
            };
            loadNotifications();
            const interval = setInterval(loadNotifications, 10000);
            return () => clearInterval(interval);
          }, [nickname]);

          const markOneNotifRead = async (notif, tabTarget) => {
            await fetch(
              `${SUPABASE_URL}/rest/v1/notifications?id=eq.${notif.id}`,
              { method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify({ read: true }) }
            );
            setNotifItems(prev => prev.filter(n => n.id !== notif.id));
            setShowNotifPanel(false);
            // Una notifica d'invito è «viva» solo se il server ha un invito aperto per me:
            // altrimenti toccarla la chiude soltanto (spec §4.4, niente più soglia dei 120 s).
            // La lettura aggiorna anche il banner, senza aspettare il giro delle presenze.
            if (notif.type === 'telepathy_invite') {
              const r = await aggiornaInviti();
              if (!r || !r.in_arrivo) return;
            }
            if (notif.type === 'private_message') {
              // Forza reload immediato dei messaggi privati prima di aprire il profilo,
              // così la conversazione non appare vuota anche se il poll (8s) non è ancora scattato.
              // Via RPC e non con una SELECT diretta: la lettura pubblica di
              // private_messages e' chiusa da Messaggi Step B (tornerebbe 0 righe e
              // svuoterebbe la conversazione) e solo get_my_messages applica il filtro
              // dei bloccati introdotto da SP1.
              try {
                if (!isGuest && passwordHash) {
                  const { data } = await supabase.rpc('get_my_messages', {
                    p_nickname: nickname, p_password_hash: passwordHash
                  });
                  if (Array.isArray(data)) {
                    const all = [...data];
                    all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    setPrivateMessages(all);
                  }
                }
              } catch (err) { console.warn('reload private_messages failed', err); }
              const senderMatch = notif.message.match(/^(.+) ti ha inviato/);
              if (senderMatch) openProfile(senderMatch[1]);
            } else {
              setActiveTab(tabTarget);
            }
          };

          const getConversationMessages = (otherUser) => {
            return privateMessages.filter(m =>
              (m.sender_name === nickname && m.receiver_name === otherUser) ||
              (m.sender_name === otherUser && m.receiver_name === nickname)
            ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          };

          const showErrorToast = (msg) => setErrorToast(msg || t.connectionError);

          const sendPrivateMessage = async (receiverName, text) => {
            if (!text.trim() || !receiverName) return false;
            // Scrittura via RPC SECURITY DEFINER (Messaggi Step A): l'insert diretto è
            // bloccato da RLS. La RPC valida l'input, inserisce il messaggio E crea la
            // notifica server-side (niente più insert separato lato client).
            const { data, error } = await supabase.rpc('send_private_message', {
              p_sender_id: sessionId,
              p_sender_name: nickname || 'Anonymous',
              p_receiver_name: receiverName,
              p_content: text.trim(),
              p_sender_password_hash: passwordHash
            });
            if (error) return false;
            // Optimistic UI: la RPC ritorna la riga inserita (oggetto singolo o array).
            const row = Array.isArray(data) ? data[0] : data;
            if (row && row.id) {
              setPrivateMessages(prev => [...prev, row]);
            }
            return true;
          };

          const submitPrivateMessage = async () => {
            const txt = newPrivateMessage;
            if (!txt.trim() || !viewingProfile || savingContent) return;
            // Niente falso "inviato": se il destinatario non è registrato non può
            // ricevere/leggere i messaggi (la RPC di lettura richiede un profilo). L'UI
            // già nasconde l'input, questa è una guardia di sicurezza.
            if (!viewingProfile.registered) { showErrorToast(); return; }
            setNewPrivateMessage('');
            setSavingContent(true);
            const ok = await sendPrivateMessage(viewingProfile.nickname, txt);
            setSavingContent(false);
            if (ok) {
              markAsRead(viewingProfile.nickname);
            } else {
              setNewPrivateMessage(txt);  // ripristina testo
              showErrorToast();
            }
          };

          const markAsRead = async (otherUser) => {
            const unreadMsgs = privateMessages.filter(m => m.sender_name === otherUser && m.receiver_name === nickname && !m.is_read);
            for (const msg of unreadMsgs) {
              await supabase.rpc('mark_message_read', { p_message_id: msg.id, p_receiver_name: nickname });
            }
          };

          const createRitual = async () => {
            if (!newRitual.name || !newRitual.date || !newRitual.time) {
              alert(t.fillNameDateTime);
              return;
            }

            // Il modulo raccoglie data e ora nel fuso di chi scrive; il database vuole UTC.
            // Senza questa conversione le 21:00 di Roma finivano salvate come 21:00 UTC, cioè
            // le 23:00 locali — e lo scarto cambiava da solo al cambio dell'ora legale.
            const istanteLocale = new Date(`${newRitual.date}T${newRitual.time}`);
            if (isNaN(istanteLocale.getTime())) {
              alert(t.fillNameDateTime);
              return;
            }
            const dataUtc = istanteLocale.toISOString().slice(0, 10);
            const oraUtc = istanteLocale.toISOString().slice(11, 16);

            // Ripetizione (28_): i giorni ISO 1=lun…7=dom, la fine nel calendario di chi crea, il
            // fuso dal telefono. Ora e giorno locali li ricava il server dall'istante: qui non si
            // mandano, così non possono contraddirlo.
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
              const { data, error } = await supabase.rpc('create_ritual', {
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
                ...(ricorre ? { p_ripeti_giorni: giorni, p_ripeti_fino: newRitual.fino, p_fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } : {})
              });
              if (error) {
                console.warn('Supabase RPC create_ritual error:', error);
                setSavingContent(false);
                // Gli errori di ricorrenza hanno una frase loro: dicono cosa correggere.
                const codice = Object.keys(t.rituals.recurrenceErrors).find(k => (error.message || '').includes(k));
                if (codice) setErrorToast(t.rituals.recurrenceErrors[codice]); else showErrorToast();
                return;  // modale resta aperto, form non svuotato
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

          // --- Notifiche push di avvio rituale --------------------------------------
          // Il permesso del browser si chiede UNA VOLTA SOLA nella vita: se la persona dice no,
          // il popup non ricompare mai più e per tornare indietro deve andare a mano nelle
          // impostazioni di sistema. Per questo prima chiediamo NOI, dentro l'app, e apriamo il
          // popup vero solo su un sì. Un rifiuto così resta nostro e ri-proponibile.

          const pushDisponibile = () =>
            typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

          const b64UrlToUint8 = (b64) => {
            const pad = '='.repeat((4 - (b64.length % 4)) % 4);
            const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
            const raw = atob(s);
            return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
          };

          // Il service worker, quando il browser gli cambia l'indirizzo sotto i piedi, non vede
          // localStorage. Gli lasciamo in una cache dedicata il minimo per ri-registrarsi da solo.
          const salvaConfigPush = async () => {
            try {
              const c = await caches.open('ga-push-config');
              await c.put('config', new Response(JSON.stringify({
                url: SUPABASE_URL,
                key: SUPABASE_KEY,
                sessionId,
                locale: lang,
                vapid: VAPID_PUBLIC_KEY
              }), { headers: { 'Content-Type': 'application/json' } }));
            } catch (_) { /* cache non disponibile: si riprova al prossimo avvio */ }
          };

          const iscriviPush = async () => {
            const reg = await navigator.serviceWorker.ready;
            const esistente = await reg.pushManager.getSubscription();
            const sub = esistente || await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: b64UrlToUint8(VAPID_PUBLIC_KEY)
            });
            const j = sub.toJSON();
            // Il client Supabase fatto a mano NON solleva: ritorna { data, error }. Senza
            // questo controllo l'app dichiarava le notifiche attive anche quando sul server
            // non era stata scritta nessuna riga — interruttore verde e nessun abbonamento.
            const { error } = await supabase.rpc('register_push_subscription', {
              p_session_id: sessionId,
              p_endpoint: sub.endpoint,
              p_p256dh: j.keys.p256dh,
              p_auth: j.keys.auth,
              p_locale: lang
            });
            if (error) throw new Error('registrazione push non riuscita');

            await salvaConfigPush();
            localStorage.removeItem('ga_push_spento');
            localStorage.removeItem('ga_push_rifiutato_il');
            setPushAttive(true);
          };

          // Uscita dall'account: si disfa l'abbonamento SENZA scrivere il segno di
          // spegnimento, perché non è una scelta di chi entrerà dopo su questo telefono.
          const spegniPushAlLogout = () => {
            setPushAttive(false);
            (async () => {
              try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (sub) {
                  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
                  await sub.unsubscribe();
                }
              } catch (_) { /* niente da disfare */ }
              // La config serve al service worker per ri-registrarsi da solo: lasciarla qui
              // significherebbe farlo ri-registrare col sessionId di chi è uscito.
              try { await caches.delete('ga-push-config'); } catch (_) {}
            })();
          };

          // La config lasciata al service worker va tenuta al passo con l'identità e la lingua
          // correnti. Senza, al primo rinnovo dell'indirizzo il service worker ri-registrerebbe
          // l'abbonamento con il sessionId di PRIMA — tipicamente quello da ospite, dopo che la
          // persona si è registrata — sovrascrivendo quello giusto: la persona smette di
          // ricevere notifiche e niente lo segnala. Stessa cosa per la lingua.
          // Si ri-registra anche sul server, non solo nella cache: `locale` sta nella riga di
          // `push_subscriptions` e senza questo passaggio chi cambia lingua continuerebbe a
          // ricevere le notifiche nella lingua vecchia finché non rifà «Partecipa».
          // `iscriviPush` riusa l'abbonamento esistente, quindi non chiede nessun permesso.
          React.useEffect(() => {
            if (!pushAttive || !sessionId) return;
            iscriviPush().catch(() => salvaConfigPush());
          }, [sessionId, lang, pushAttive]);

          const spegniPush = async () => {
            // Il segno in localStorage viene prima di tutto: è quello che distingue uno
            // spegnimento voluto da un abbonamento che il browser ha buttato via da solo.
            localStorage.setItem('ga_push_spento', '1');
            setPushAttive(false);
            // L'abbonamento è uno solo per telefono, rituali e inviti insieme: senza, restare in
            // «Disponibili su invito» sarebbe una promessa falsa (ruling M4).
            if (disponibileInviti !== false) spegniDisponibilita();
            try {
              const reg = await navigator.serviceWorker.ready;
              const sub = await reg.pushManager.getSubscription();
              if (sub) {
                await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
                await sub.unsubscribe();
              }
            } catch (_) { /* se il browser l'ha già buttata via, il segno basta */ }
          };

          // Decide se e cosa chiedere al momento del «Partecipa». Non apre MAI il popup del
          // browser da sola: quello parte solo dalla risposta affermativa alla nostra domanda.
          const valutaPush = async () => {
            if (!pushDisponibile()) {
              // Su iPhone in Safari non installato l'oggetto Notification non esiste: non
              // possiamo nemmeno CHIEDERE. Invece di tacere si spiega che l'app va prima
              // aggiunta alla schermata Home — senza quel passo, su iOS le notifiche non
              // esistono proprio.
              const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
              const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
              if (iOS && !installata) setMostraInstallaPerPush(true);
              return;
            }
            if (localStorage.getItem('ga_push_spento') === '1') return;   // scelta esplicita, si rispetta
            if (Notification.permission === 'denied') return;             // già bruciato: non si insiste

            if (Notification.permission === 'granted') {
              try { await iscriviPush(); } catch (_) { /* si riproverà */ }
              return;
            }

            const rifiutatoIl = localStorage.getItem('ga_push_rifiutato_il');
            if (rifiutatoIl && Date.now() - Date.parse(rifiutatoIl) < 7 * 24 * 60 * 60 * 1000) return;

            setChiediPush(true);
          };

          const rispondiPush = async (si) => {
            setChiediPush(false);
            // Guardia indispensabile: questa funzione è anche l'onClick dell'interruttore nel
            // profilo, e su iPhone in Safari non installato `Notification` non esiste. Senza il
            // controllo, il tocco sollevava un TypeError dentro una promise: il bottone non
            // faceva nulla, nessun messaggio, nessuna spiegazione.
            if (!pushDisponibile()) {
              const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
              const installata = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
              if (iOS && !installata) setMostraInstallaPerPush(true);
              return;
            }
            if (!si) {
              // Un no nostro, non del browser: fra sette giorni si può ri-proporre.
              localStorage.setItem('ga_push_rifiutato_il', new Date().toISOString());
              return;
            }
            const esito = await Notification.requestPermission();
            if (esito !== 'granted') return;
            try { await iscriviPush(); } catch (_) { /* si riproverà al prossimo Partecipa */ }
          };

          // Adesioni in corso: due tocchi rapidi su «Partecipa» mandavano due notifiche al creatore.
          const joiningRef = useRef(new Set());
          const joinRitual = async (ritualId) => {
            const ritual = rituals.find(r => r.id === ritualId);
            if (!ritual || ritual.participants.includes(sessionId)) return;
            if (joiningRef.current.has(ritualId)) return;
            joiningRef.current.add(ritualId);
            const { error } = await supabase.rpc('join_ritual', { p_ritual_id: ritualId, p_session_id: sessionId });
            joiningRef.current.delete(ritualId);
            if (error) { showErrorToast(); return; }
            // join_ritual non restituisce la riga: senza questo il pulsante cambiava solo al
            // ricaricamento successivo (fino a 10 secondi in cui sembrava non fosse successo niente).
            setRituals(prev => prev.map(r => r.id === ritualId && !r.participants.includes(sessionId)
              ? { ...r, participants: [...r.participants, sessionId] } : r));
            if (ritual.creator && ritual.creator !== nickname) {
              await supabase.from('notifications').insert({
                user_nickname: ritual.creator,
                type: 'ritual_join',
                message: `${nickname} si è unito/a al tuo rituale "${ritual.name}"`
              });
            }
            await valutaPush();
          };

          // Le RPC che restituiscono una riga (create_ritual, toggle_ritual_candle) la danno dalla
          // TABELLA: per un rituale che si ripete lì date/time sono il primo appuntamento, non quello
          // di oggi. Sostituirla a quella della vista riporterebbe il rituale al giorno 1 (stanza
          // chiusa, musica spenta). Si rilegge dalla vista, che è l'unica fonte per l'app.
          const rileggiRituale = async (id) => {
            const { data, error } = await supabase.from('rituali_correnti').select('*').eq('id', id);
            // Se la lettura fallisce (rete, timeout) non sappiamo com'è il rituale: toglierlo dalla
            // lista lo farebbe sparire per un errore passeggero. Si rimuove solo quando la lettura
            // è riuscita e non ha restituito nessuna riga (rituale davvero sparito).
            if (error) return;
            setRituals(prev => {
              const riga = Array.isArray(data) && data[0];
              if (!riga) return prev.filter(r => r.id !== id);
              return prev.some(r => r.id === id) ? prev.map(r => r.id === id ? riga : r) : [riga, ...prev];
            });
          };

          // Chi è registrato ma ha la password azzerata (27b_, la falla account) ha ancora in
          // memoria una credenziale vecchia: il database risponde «Auth failed» e un generico
          // «non è stato possibile» la lascerebbe senza sapere cosa fare. Le si dice come uscirne.
          const messaggioErroreRituale = (error, generico) => {
            if (!eChiaveScaduta(error)) return generico;
            segnalaChiaveScaduta();
            return t.rituals.reloginNeeded;
          };

          // Lasciare un rituale a cui ci si era iscritti (il creatore non può: deve cancellarlo o fermarlo).
          const leaveRitual = async (ritualId) => {
            const { error } = await supabase.rpc('leave_ritual', {
              p_ritual_id: ritualId, p_session_id: sessionId, p_password_hash: passwordHash || ''
            });
            if (error) { setErrorToast(messaggioErroreRituale(error, t.rituals.leaveFailed)); return; }
            await rileggiRituale(ritualId);
          };

          const sendEnergy = async (ritualId) => {
            const ritual = rituals.find(r => r.id === ritualId);
            if (!ritual) return;
            await supabase.rpc('send_ritual_energy', { p_ritual_id: ritualId, p_amount: 10 });
          };

          // Il nome serve alla stanza per dire chi ha acceso la candela. Per un profilo registrato
          // il database usa quello del profilo e ignora questo, ma chiede la credenziale
          // (30_candela_nella_stanza.sql).
          const toggleCandle = async (ritualId) => {
            // Il database accende solo a chi è nelle presenze della stanza (visto nell'ultimo
            // minuto). La stanza si segna all'apertura, ma un tocco rapido può arrivare prima che
            // quella chiamata sia finita: ci si segna qui, prima, e il flusso normale non si rompe.
            const presenza = await supabase.rpc('segna_presenza_rituale', { p_ritual_id: ritualId, p_session_id: sessionId });
            const { data, error } = await supabase.rpc('toggle_ritual_candle', {
              p_ritual_id: ritualId,
              p_session_id: sessionId,
              p_nickname: nickname,
              p_password_hash: passwordHash || ''
            });
            // not_live: l'appuntamento è finito mentre la stanza era aperta (o non è ancora
            // iniziato). Merita una frase sua, non un generico errore di connessione.
            const motivo = (error && error.message) || '';
            if (motivo.includes('not_live')) { showErrorToast(t.rituals.candleNotLive); return; }
            if (motivo.includes('Auth failed')) { showErrorToast(t.rituals.reloginNeeded); return; }
            if (motivo.includes('too_many_candles')) { showErrorToast(t.rituals.candleTooMany); return; }
            // not_present: se la presenza appena chiesta è fallita, il motivo vero è quello (fuori
            // orario, o la connessione); solo se è andata bene manca davvero l'ingresso nella stanza.
            if (motivo.includes('not_present')) {
              const motivoPresenza = (presenza && presenza.error && presenza.error.message) || '';
              if (motivoPresenza.includes('not_live')) showErrorToast(t.rituals.candleNotLive);
              else if (presenza && presenza.error) showErrorToast();
              else showErrorToast(t.rituals.candleNotPresent);
              return;
            }
            if (error || !data || data.length === 0) { showErrorToast(); return; }
            await rileggiRituale(ritualId);
          };

          // Cancellazione del proprio rituale. Il vero controllo sta nel database
          // (25_cancella_rituale.sql): qui si nasconde solo il pulsante quando non ha senso,
          // ma un pulsante nascosto non protegge niente — chiunque puo' chiamare la funzione.
          const [ritualToDelete, setRitualToDelete] = useState(null);
          const doDeleteRitual = async (ritualId) => {
            const { error } = await supabase.rpc('delete_ritual', {
              p_ritual_id: ritualId,
              p_session_id: sessionId,
              p_password_hash: passwordHash || ''
            });
            if (error) {
              // Il caso «e' iniziato mentre guardavi il modale» merita una frase sua: l'app
              // dice perche' non si puo' piu', invece di un generico «non ha funzionato».
              const msg = (error.message || '');
              setErrorToast(msg.includes('already_started') ? t.rituals.deleteStarted : t.rituals.deleteFailed);
              return;
            }
            setRituals(prev => prev.filter(r => r.id !== ritualId));
          };

          // Fermare il ciclo di un rituale ricorrente (il controllo vero sta in 28_ferma_rituale).
          const [ritualToStop, setRitualToStop] = useState(null);
          const doFermaRituale = async (ritualId) => {
            const { error } = await supabase.rpc('ferma_rituale', {
              p_ritual_id: ritualId, p_session_id: sessionId, p_password_hash: passwordHash || ''
            });
            if (error) { setErrorToast(messaggioErroreRituale(error, t.rituals.stopFailed)); return; }
            await rileggiRituale(ritualId);
          };

          const getRitualStatus = (ritual) => {
            const now = new Date();
            const ritualTime = new Date(`${ritual.date}T${ritual.time}Z`);
            const endTime = new Date(ritualTime.getTime() + ritual.duration * 60000);
            
            if (now >= ritualTime && now <= endTime) return 'live';
            if (now > endTime) return 'ended';
            
            const diff = ritualTime - now;
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            
            if (hours > 0) return `${hours}h ${minutes}m`;
            return `${minutes}m`;
          };

          // Il rituale arrivato dalla notifica: se è in corso si entra, se no non si fa niente di
          // speciale; se non esiste più (già pulito) lo si dimentica.
          // Si aspetta che la persona abbia superato la richiesta del nome: prima, la stanza
          // segnerebbe la presenza con un identificativo provvisorio e farebbe partire la musica
          // sopra la schermata d'accesso. L'id resta qui e la stanza si apre dopo l'entrata.
          React.useEffect(() => {
            if (showNicknamePrompt || ritualeDaAprire == null || rituals.length === 0) return;
            const r = rituals.find(x => x.id === ritualeDaAprire);
            if (r && getRitualStatus(r) === 'live') setStanzaId(r.id);
            setRitualeDaAprire(null);
          }, [ritualeDaAprire, rituals, showNicknamePrompt]);

          // La candela della stanza: accesa da me? e chi l'ha accesa in questo appuntamento.
          const candelaMiaStanza = !!stanza && (stanza.candles || []).includes(sessionId);
          // Prima che la 30_ sia applicata la vista non ha candles_nomi: niente nomi, niente errore.
          // L'ordine è quello di accensione (l'array candles): un oggetto jsonb non lo conserva.
          const nomiCandeleStanza = stanza
            ? (stanza.candles || []).map(sid => (stanza.candles_nomi || {})[sid]).filter(n => n && !isBlocked(n))
            : [];

          // Nella stanza ci si segna all'ingresso e ogni 30 secondi: il numero conta chi si è fatto
          // vivo nell'ultimo minuto (28_). Finito l'appuntamento, la stanza si chiude da sola: la
          // lista si ricarica ogni 10 s (loadData) e getRitualStatus viene rivalutato a ogni giro.
          const stanzaLive = !!stanza && getRitualStatus(stanza) === 'live';
          React.useEffect(() => {
            // Il numero di prima non vale per un'altra stanza (né per una riaperta più tardi):
            // meglio nessun numero per un attimo che quello sbagliato.
            setPresentiStanza(null);
            if (stanzaId == null) return;
            if (!stanzaLive) { setStanzaId(null); return; }
            let vivo = true;
            const segna = async () => {
              const { data, error } = await supabase.rpc('segna_presenza_rituale', { p_ritual_id: stanzaId, p_session_id: sessionId });
              if (vivo && !error && typeof data === 'number') setPresentiStanza(data);
            };
            segna();
            const timer = setInterval(segna, 30000);
            return () => { vivo = false; clearInterval(timer); };
          }, [stanzaId, stanzaLive, sessionId]);

          // Data e ora del rituale nel fuso di chi guarda. Nel database restano in UTC:
          // un rituale mondiale è un istante solo, che ognuno legge sul proprio orologio.
          const formatRitualWhen = (ritual) => {
            const istante = new Date(`${ritual.date}T${ritual.time}Z`);
            if (isNaN(istante.getTime())) return `${ritual.date} ${ritual.time}`;
            // dateStyle/timeStyle non si possono combinare con timeZoneName: Intl lancia
            // "Invalid option : option" e la pagina va in bianco. Opzioni per componenti.
            return new Intl.DateTimeFormat(LOC, {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', hour12: false,
              timeZoneName: 'short'
            }).format(istante);
          };

          // «Ogni giorno alle 07:00» / «Lun, Mer, Ven alle 07:00»: l'ora è quella di chi guarda,
          // calcolata dall'appuntamento corrente (date/time della vista), come il resto della scheda.
          // I giorni della settimana sono invece quelli del fuso del creatore: per chi guarda da un
          // fuso lontano il giorno può non coincidere con il suo calendario. Non si converte (fuori perimetro).
          const descriviRipetizione = (ritual) => {
            const g = ritual.ripeti_giorni || [];
            const quando = g.length === 7 ? t.rituals.everyDay : g.map(n => t.rituals.weekdaysShort[n - 1]).join(', ');
            const istante = new Date(`${ritual.date}T${ritual.time}Z`);
            const ora = isNaN(istante.getTime()) ? '' : new Intl.DateTimeFormat(LOC,
              { hour: '2-digit', minute: '2-digit', hour12: false }).format(istante);
            return t.rituals.whenAt(quando, ora);
          };

          // Musica di sottofondo. Suona solo quando una sessione è davvero in corso: un rituale
          // a cui si partecipa mentre è live, oppure una sessione di telepatia. Mai all'apertura
          // dell'app — un suono che parte da solo su un telefono in mezzo agli altri fa chiudere
          // la pagina, e i browser lo bloccherebbero comunque senza un gesto dell'utente.
          const MUSIC_SRC = 'assets/meditation-music-rockot.mp3';
          const MUSIC_VOLUME = 0.35;
          const musicRef = React.useRef(null);
          const [musicMuted, setMusicMuted] = useState(() => {
            try { return localStorage.getItem('ga_music_muted') === '1'; } catch { return false; }
          });
          const toggleMusic = () => {
            setMusicMuted(prev => {
              const next = !prev;
              try { localStorage.setItem('ga_music_muted', next ? '1' : '0'); } catch { /* Safari privato: pazienza */ }
              return next;
            });
          };
          // Anche la stanza aperta su un rituale in corso fa partire la musica: ci si può entrare
          // dalla notifica senza essere iscritti.
          const ritualeLive = rituals.find(r =>
            (r.id === stanzaId || (Array.isArray(r.participants) && r.participants.includes(sessionId))) && getRitualStatus(r) === 'live');
          const inLiveRitual = !!ritualeLive;
          const inTelepathySession = !!partner && !sessionEnded;
          const musicOn = (inLiveRitual || inTelepathySession) && !musicMuted;
          // Vero quando il browser si è rifiutato di far partire la musica e stiamo aspettando
          // un gesto qualsiasi della persona. Non è un dettaglio da nascondere: è l'unico
          // momento in cui possiamo dirle che le basta toccare lo schermo.
          const [musicaInAttesaDiGesto, setMusicaInAttesaDiGesto] = useState(false);
          // Istante dell'ultimo gesto che ha sbloccato la musica. Serve al pulsante 🔊: da quel
          // tocco nasce un `click`, e senza questa memoria il pulsante silenzierebbe proprio la
          // musica che la persona ha appena fatto partire toccandolo.
          const sbloccoMusicaRef = React.useRef(0);
          // La soglia del rituale (23/09/2026). Chi arriva da una notifica trovava il megafono
          // acceso e nessun suono, finche' per caso non toccava lo schermo. Il tocco non si puo'
          // evitare, ma si puo' chiedere: un invito a tutto schermo che fa da ingresso.
          // Compare solo se il browser ha davvero bloccato l'audio: dove la musica parte da sola
          // non si vede. Sparisce con un attimo di ritardo dopo lo sblocco, perche' il `click`
          // nato dal tocco arriva dopo e deve cadere sulla soglia, non sul pulsante sotto.
          const [sogliaAperta, setSogliaAperta] = useState(false);
          const tocchiSogliaRef = React.useRef(0);
          React.useEffect(() => {
            if (!inLiveRitual) { setSogliaAperta(false); return; }
            if (musicaInAttesaDiGesto) { tocchiSogliaRef.current = 0; setSogliaAperta(true); return; }
            const timer = setTimeout(() => setSogliaAperta(false), 800);
            return () => clearTimeout(timer);
          }, [musicaInAttesaDiGesto, inLiveRitual]);
          React.useEffect(() => {
            const el = musicRef.current;
            if (!el) return;
            // Se music-helpers.js non è arrivato — finestra di aggiornamento del service
            // worker, rete ballerina, un'estensione che lo blocca — l'app deve restare muta,
            // non andare in bianco: un'eccezione qui dentro smonta tutto l'albero React.
            if (typeof MusicHelpers === 'undefined') return;
            if (musicOn) {
              // Sul telefono la musica NON parte da sola. Chi arriva da una notifica apre una
              // pagina che non ha ancora toccato, e i browser dei telefoni non fanno uscire
              // audio da lì. Prima del 22/09/2026 l'app chiedeva `play()`, si sentiva dire di
              // no e buttava via il rifiuto: nessun suono e nessuna traccia. Ora resta in
              // ascolto e riparte al primo gesto — dentro un rituale la gente chiude gli occhi,
              // quindi non possiamo aspettarci che vada a cercare un pulsante.
              return MusicHelpers.avviaMusica(el, {
                volume: MUSIC_VOLUME,
                onGesto: () => { sbloccoMusicaRef.current = Date.now(); },
                onStato: (stato) => setMusicaInAttesaDiGesto(stato === 'in-attesa-di-gesto')
              });
            }
            setMusicaInAttesaDiGesto(false);
            if (!el.paused) return MusicHelpers.fermaMusica(el);
          }, [musicOn]);

          const toggleRitualComments = async (ritualId) => {
            if (expandedRitualId === ritualId) { setExpandedRitualId(null); return; }
            setExpandedRitualId(ritualId);
            if (!ritualCommentsMap[ritualId]) {
              const { data } = await supabase.from('ritual_comments').select('*').eq('ritual_id', ritualId).order('created_at', { ascending: true });
              if (data) setRitualCommentsMap(prev => ({ ...prev, [ritualId]: data.filter(x => !isBlocked(x.author_nickname)) }));
            }
          };

          const createRitualComment = async (ritualId) => {
            const content = (newRitualCommentContents[ritualId] || '').trim();
            if (!content) return;
            const { data, error } = await supabase.rpc('create_ritual_comment', {
              p_ritual_id: ritualId,
              p_author_nickname: nickname,
              p_content: content,
              p_password_hash: passwordHash
            });
            if (error || !data || data.length === 0) {
              showErrorToast();
              return;
            }
            setRitualCommentsMap(prev => ({ ...prev, [ritualId]: [...(prev[ritualId] || []), ...data] }));
            setNewRitualCommentContents(prev => ({ ...prev, [ritualId]: '' }));
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
            // Optimistic update: mostra subito il post e svuota la textarea
            const optimistic = {
              id: `local-${Date.now()}`,
              author_nickname: nickname,
              content,
              created_at: new Date().toISOString()
            };
            setPosts(prev => [optimistic, ...prev]);
            setNewPostContent('');
            setSavingContent(true);
            const { error } = await supabase.from('consciousness_posts').insert({ author_nickname: nickname, content });
            setSavingContent(false);
            if (error) {
              setPosts(prev => prev.filter(p => p.id !== optimistic.id));  // rollback
              setNewPostContent(content);                                   // ripristina testo
              showErrorToast();
            }
          };

          const togglePostComments = async (postId) => {
            if (expandedPostId === postId) {
              setExpandedPostId(null);
              return;
            }
            setExpandedPostId(postId);
            const { data } = await supabase.from('consciousness_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
            if (data) setCommentsMap(prev => ({ ...prev, [postId]: data.filter(x => !isBlocked(x.author_nickname)) }));
          };

          const createComment = async (postId) => {
            const content = (newCommentContents[postId] || '').trim();
            if (!content) return;
            // Optimistic update: mostra subito il commento e svuota l'input
            const optimistic = {
              id: `local-${Date.now()}`,
              post_id: postId,
              author_nickname: nickname,
              content,
              created_at: new Date().toISOString()
            };
            setCommentsMap(prev => ({ ...prev, [postId]: [...(prev[postId] || []), optimistic] }));
            setNewCommentContents(prev => ({ ...prev, [postId]: '' }));
            const { error } = await supabase.from('consciousness_comments').insert({ post_id: postId, author_nickname: nickname, content });
            if (error) {
              setCommentsMap(prev => ({ ...prev, [postId]: (prev[postId] || []).filter(c => c.id !== optimistic.id) }));  // rollback
              setNewCommentContents(prev => ({ ...prev, [postId]: content }));  // ripristina testo
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

          const renderFooter = () => (
            <footer className="app-footer text-secondary">
              <span>Global Awakening · {new Date().getFullYear()}</span>
              <span style={{margin: '0 0.4rem'}}>·</span>
              <button onClick={() => setShowPrivacy(true)}>
                {t.privacy.linkLabel}
              </button>
              <span style={{margin: '0 0.4rem'}}>·</span>
              <a href="https://github.com/global-awakening/global-awakening.github.io/issues" target="_blank" rel="noopener noreferrer"
                 style={{color: '#a78bfa', textDecoration: 'underline', cursor: 'pointer', minHeight: '40px', display: 'inline-flex', alignItems: 'center'}}>
                {t.reportIssue}
              </a>
              <span style={{margin: '0 0.4rem'}}>·</span>
              <span>
                {t.musicCredit}{' '}
                <a href="https://pixabay.com/users/rockot-1947599/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=184575"
                   target="_blank" rel="noopener noreferrer"
                   style={{color: '#a78bfa', textDecoration: 'underline'}}>Rockot</a>
                {' '}{t.musicFrom}{' '}
                <a href="https://pixabay.com/music/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=184575"
                   target="_blank" rel="noopener noreferrer"
                   style={{color: '#a78bfa', textDecoration: 'underline'}}>Pixabay</a>
              </span>
              {!isStandalone && (deferredPrompt || isIos) && (
                <>
                  <span style={{margin: '0 0.4rem'}}>·</span>
                  <button onClick={handleInstall}
                    style={{background: 'none', border: 'none', color: '#a78bfa', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', padding: 0, minHeight: '40px'}}>
                    {t.pwaInstall}
                  </button>
                </>
              )}
            </footer>
          );

          // Helper condiviso perché il modale serve in DUE rami di render: la schermata
          // di ingresso e l'app vera. Su iPhone la prima è l'unica che un visitatore
          // nuovo vede, e senza il modale lì il bottone "Installa app" non fa nulla.
          const renderIosInstallModal = () => showIosInstall && (
            <div className="modal-overlay" onClick={() => setShowIosInstall(false)} style={{zIndex: 70}}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '22rem'}}>
                <h3 className="text-xl font-bold text-white mb-2">{isInAppBrowser ? t.pwaIosBrowserTitle : t.pwaIosTitle}</h3>
                <p className="text-secondary text-sm mb-4">{isInAppBrowser ? t.pwaIosBrowserBody : t.pwaIosBody}</p>
                <button className="btn-primary w-full" onClick={() => setShowIosInstall(false)}>{t.pwaIosClose}</button>
              </div>
            </div>
          );

          // L'invito a installare: su iPhone la PWA è l'unico canale di distribuzione,
          // quindi non può restare un link sottile in fondo alla pagina. Stesse condizioni
          // del link nel footer, più "non l'hai già chiuso". Il footer resta come ripiego.
          const renderInstallBanner = (variant = '') => !isStandalone && (deferredPrompt || isIos) && !installBannerDismissed && (
            <div className={'install-banner ' + variant}>
              <button className="install-banner-close" aria-label={t.pwaBannerClose}
                      onClick={dismissInstallBanner}>✕</button>
              <span className="install-banner-text">{t.pwaBannerText}</span>
              <button className="btn-primary install-banner-cta" onClick={handleInstall}>{t.pwaInstall}</button>
            </div>
          );

          const renderPrivacyModal = () => showPrivacy && (
            <div className="modal-overlay" onClick={() => setShowPrivacy(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem'}}>
                  <h2 className="text-white font-bold" style={{fontSize: '1.3rem'}}>{t.privacy.title}</h2>
                  <button onClick={() => setShowPrivacy(false)} aria-label={t.privacy.close} className="btn-secondary" style={{minWidth: '40px', minHeight: '40px', padding: '0.25rem 0.6rem'}}>✕</button>
                </div>
                <p className="text-secondary" style={{fontSize: '0.8rem', marginBottom: '1rem'}}>{t.privacy.lastUpdated}</p>
                <p className="text-secondary" style={{fontSize: '0.9rem', marginBottom: '1rem'}}>{t.privacy.intro}</p>
                {t.privacy.sections.map((s, i) => (
                  <div key={i} style={{marginBottom: '1rem'}}>
                    <h3 className="text-white font-bold mb-2" style={{fontSize: '1rem'}}>{s.heading}</h3>
                    <p className="text-secondary" style={{fontSize: '0.9rem', lineHeight: '1.5'}}>{s.body}</p>
                  </div>
                ))}
              </div>
            </div>
          );

          if (showNicknamePrompt) {
            return (
              <div className="min-h-screen bg-gradient flex flex-col items-center justify-center p-4" style={{paddingBottom: '3.5rem'}}>
                {renderInstallBanner('install-banner--landing')}

                <div className="absolute top-4 right-4">
                  <label className="lingua-menu btn-secondary" title="Language">
                    <span aria-hidden="true">🌐 {lang.toUpperCase()}</span>
                    <select data-test="lingua" aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)}>
                      {['en', 'it', 'es', 'fr'].map((l) => (
                        <option key={l} value={l}>{window.LingueHelpers ? window.LingueHelpers.etichetta(l) : l.toUpperCase()}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="bg-glass rounded-3xl p-8 max-w-md w-full shadow-2xl border-glass">
                  <div className="text-center mb-8">
                    <div style={{fontSize: '4rem'}} className="mb-4 pulse-glow">⭐</div>
                    <h1 className="text-4xl font-bold text-white mb-2">{t.title}</h1>
                    <p className="text-secondary text-sm">{t.subtitle}</p>
                  </div>

                  {/* Auth Tabs — nascosti durante il reset password via link email */}
                  {!resetToken && (
                  <div style={{display: 'flex', gap: '0', marginBottom: '1.5rem', borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)'}}>
                    {['login', 'register', 'guest'].map((tab, i, arr) => (
                      <button
                        key={tab}
                        onClick={() => { setAuthTab(tab); setLoginError(''); setLoginSuccess(''); }}
                        style={{
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
                        }}
                      >
                        {tab === 'guest' ? t.tabGuest : tab === 'login' ? t.tabLogin : t.tabRegister}
                      </button>
                    ))}
                  </div>
                  )}

                  <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                    {/* Guest Tab */}
                    {authTab === 'guest' && !resetToken && (
                      <>
                        <input
                          type="text"
                          value={tempNickname}
                          onChange={(e) => { setTempNickname(e.target.value); setLoginError(''); }}
                          placeholder={t.usernamePlaceholder}
                          aria-label={t.usernamePlaceholder}
                          maxLength={30}
                        />
                        <button onClick={handleEnterGuest} className="btn-primary" style={{width: '100%', fontSize: '1.125rem'}}>
                          {t.enterAsGuest}
                        </button>
                      </>
                    )}

                    {/* Login Tab */}
                    {authTab === 'login' && !showResetForm && !resetToken && (
                      <>
                        <input
                          type="email"
                          value={tempEmail}
                          onChange={(e) => { setTempEmail(e.target.value); setLoginError(''); }}
                          placeholder={t.emailPlaceholder}
                          aria-label={t.emailPlaceholder}
                        />
                        <PasswordInput
                          autoComplete="current-password"
                          mostra={t.showPassword}
                          nascondi={t.hidePassword}
                          value={tempPassword}
                          onChange={(e) => { setTempPassword(e.target.value); setLoginError(''); }}
                          placeholder={t.password}
                          aria-label={t.password}
                        />
                        <button onClick={handleLogin} className="btn-primary" style={{width: '100%', fontSize: '1.125rem'}} disabled={!tempEmail.trim() || !tempPassword.trim() || authLoading}>
                          {authLoading ? '…' : t.login}
                        </button>
                        <p
                          onClick={() => { setShowResetForm(true); setLoginError(''); setLoginSuccess(''); }}
                          style={{color: '#a78bfa', textAlign: 'center', cursor: 'pointer', fontSize: '0.875rem'}}
                        >
                          {t.forgotPassword}
                        </p>
                        <p
                          onClick={() => { setAuthTab('register'); setLoginError(''); setLoginSuccess(''); }}
                          style={{color: '#a78bfa', textAlign: 'center', cursor: 'pointer', fontSize: '0.875rem'}}
                        >
                          {t.noAccountYet}
                        </p>
                        <p
                          onClick={() => { setShowMagicLink(m => !m); setLoginError(''); setLoginSuccess(''); }}
                          style={{color: '#c4b5fd', textAlign: 'center', cursor: 'pointer', fontSize: '0.85rem', opacity: 0.8}}
                        >
                          {t.magicLinkHint}
                        </p>
                        {showMagicLink && (
                          <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', background: 'rgba(139,92,246,0.1)', borderRadius: '0.75rem', border: '1px solid rgba(139,92,246,0.3)'}}>
                            <input
                              type="email"
                              value={magicLinkEmail}
                              onChange={(e) => { setMagicLinkEmail(e.target.value); setLoginError(''); }}
                              placeholder={t.emailPlaceholder}
                              aria-label={t.emailPlaceholder}
                            />
                            <button onClick={handleSendMagicLink} className="btn-primary" style={{width: '100%'}} disabled={!magicLinkEmail.trim() || authLoading}>
                              {authLoading ? '…' : t.sendMagicLink}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* Reset Password Form */}
                    {/* Reset Step 1: inserisci email */}
                    {authTab === 'login' && showResetForm && !resetToken && (
                      <>
                        <p className="text-white font-bold text-center" style={{fontSize: '1.05rem'}}>{t.resetPassword}</p>
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={(e) => { setResetEmail(e.target.value); setLoginError(''); }}
                          placeholder={t.emailPlaceholder}
                          aria-label={t.emailPlaceholder}
                        />
                        <button onClick={handleSendResetEmail} className="btn-primary" style={{width: '100%', fontSize: '1.125rem'}} disabled={!resetEmail.trim() || authLoading}>
                          {authLoading ? '…' : t.resetPassword}
                        </button>
                        <p
                          onClick={() => { setShowResetForm(false); setLoginError(''); setLoginSuccess(''); }}
                          style={{color: '#a78bfa', textAlign: 'center', cursor: 'pointer', fontSize: '0.875rem'}}
                        >
                          {t.backToLogin}
                        </p>
                      </>
                    )}

                    {/* Reset Step 2: nuova password (quando arriva dal link email) */}
                    {resetToken && (
                      <>
                        <p className="text-white font-bold text-center" style={{fontSize: '1.05rem'}}>{t.setNewPassword}</p>
                        <PasswordInput
                          autoComplete="new-password"
                          mostra={t.showPassword}
                          nascondi={t.hidePassword}
                          value={resetNewPassword}
                          onChange={(e) => { setResetNewPassword(e.target.value); setLoginError(''); }}
                          placeholder={t.newPasswordPlaceholder}
                          aria-label={t.newPasswordPlaceholder}
                        />
                        <PasswordInput
                          autoComplete="new-password"
                          mostra={t.showPassword}
                          nascondi={t.hidePassword}
                          value={resetConfirmPassword}
                          onChange={(e) => { setResetConfirmPassword(e.target.value); setLoginError(''); }}
                          placeholder={t.confirmPasswordPlaceholder}
                          aria-label={t.confirmPasswordPlaceholder}
                        />
                        <button onClick={handleSetNewPassword} className="btn-primary" style={{width: '100%', fontSize: '1.125rem'}} disabled={!resetNewPassword.trim() || !resetConfirmPassword.trim() || authLoading}>
                          {authLoading ? '…' : t.setNewPassword}
                        </button>
                      </>
                    )}

                    {/* Register Tab */}
                    {authTab === 'register' && !resetToken && (
                      <>
                        <input
                          type="text"
                          value={tempNickname}
                          onChange={(e) => { setTempNickname(e.target.value); setLoginError(''); }}
                          placeholder={t.usernamePlaceholder}
                          aria-label={t.usernamePlaceholder}
                          maxLength={30}
                        />
                        <input
                          type="email"
                          value={tempEmail}
                          onChange={(e) => { setTempEmail(e.target.value); setLoginError(''); }}
                          placeholder={t.emailPlaceholder}
                          aria-label={t.emailPlaceholder}
                        />
                        <PasswordInput
                          autoComplete="new-password"
                          mostra={t.showPassword}
                          nascondi={t.hidePassword}
                          value={tempPassword}
                          onChange={(e) => { setTempPassword(e.target.value); setLoginError(''); }}
                          placeholder={t.password}
                          aria-label={t.password}
                        />
                        <button onClick={handleRegister} className="btn-primary" style={{width: '100%', fontSize: '1.125rem'}} disabled={!tempNickname.trim() || !tempEmail.trim() || !tempPassword.trim() || authLoading}>
                          {authLoading ? '…' : t.register}
                        </button>
                        <p
                          onClick={() => { setAuthTab('login'); setLoginError(''); setLoginSuccess(''); }}
                          style={{color: '#a78bfa', textAlign: 'center', cursor: 'pointer', fontSize: '0.875rem'}}
                        >
                          {t.alreadyHaveAccount}
                        </p>
                      </>
                    )}

                    {loginError && (
                      <div className="result-try-again rounded-xl p-3 text-center">
                        <p style={{color: '#fb923c'}} className="font-bold">{loginError}</p>
                      </div>
                    )}
                    {loginSuccess && (
                      <div className="result-success rounded-xl p-3 text-center">
                        <p style={{color: '#4ade80'}} className="font-bold">{loginSuccess}</p>
                      </div>
                    )}
                  </div>
                </div>
              {renderFooter()}
              {renderPrivacyModal()}
              {renderIosInstallModal()}
              </div>
            );
          }

          return (
            <div className="min-h-screen bg-gradient app-shell" style={{paddingBottom: '3.5rem'}}>
              <header className="sticky top-0 bg-glass border-b z-50">
                <div className="container">
                  <div className="header-inner flex items-center justify-between py-3">
                    <div className="header-left flex items-center gap-3">
                      <Star style={{width: '2rem', height: '2rem', color: '#fbbf24'}} />
                      <div>
                        <h1 className="text-xl font-bold text-white">{t.title}</h1>
                        <p className="text-primary text-xs">{t.subtitle}</p>
                      </div>
                    </div>
                    <div className="header-right flex items-center gap-3">
                      <label className="lingua-menu btn-secondary px-3 py-2" title="Language">
                        <span aria-hidden="true">🌐 {lang.toUpperCase()}</span>
                        <select data-test="lingua" aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)}>
                          {['en', 'it', 'es', 'fr'].map((l) => (
                            <option key={l} value={l}>{window.LingueHelpers ? window.LingueHelpers.etichetta(l) : l.toUpperCase()}</option>
                          ))}
                        </select>
                      </label>
                      {/* minWidth:0 + ellissi: un nickname lungo si accorcia invece di spingere fuori dallo
                          schermo menu lingua, campanella e Logout (a 360 px). Il titolo ha il nome intero. */}
                      <div className="flex items-center gap-2" style={{minWidth: 0}}>
                        <div className="text-white font-medium" style={{cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} onClick={() => setShowEditProfile(true)} title={`${nickname} · ${t.editProfile}`}>{profile.avatar && <span style={{marginRight: '0.25rem'}}>{profile.avatar}</span>}{nickname}</div>
                        <span style={{
                          flexShrink: 0,
                          fontSize: '0.65rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          background: isGuest ? 'rgba(251,191,36,0.3)' : 'rgba(34,197,94,0.3)',
                          color: isGuest ? '#fbbf24' : '#4ade80',
                          border: isGuest ? '1px solid rgba(251,191,36,0.5)' : '1px solid rgba(34,197,94,0.5)'
                        }}>{isGuest ? t.guestBadge : t.registeredBadge}</span>
                      </div>
                      {unreadCount > 0 && (
                        <span style={{
                          background: '#ef4444',
                          color: '#fff',
                          borderRadius: '9999px',
                          padding: '0.15rem 0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          cursor: 'default'
                        }} title={t.messages.title}>
                          {unreadCount} 💬
                        </span>
                      )}
                      <div style={{position: 'relative'}}>
                        {(inLiveRitual || inTelepathySession) && (
                          <button
                            // Il `click` che nasce dal tocco con cui la musica si è appena
                            // sbloccata non deve silenziarla. Si guarda l'istante del gesto e
                            // non `musicaInAttesaDiGesto`: quello è uno stato React, e fra il
                            // dito che scende e il click il ri-disegno ha già fatto in tempo a
                            // rimetterlo a falso — la guardia non scatterebbe mai.
                            onClick={() => {
                              if (Date.now() - sbloccoMusicaRef.current < 1000) return;
                              toggleMusic();
                            }}
                            className="btn-secondary px-3 py-2"
                            style={{fontSize: '0.8rem'}}
                            title={musicaInAttesaDiGesto ? t.musicTap : undefined}
                            aria-label={musicaInAttesaDiGesto ? t.musicTap : (musicMuted ? t.musicUnmute : t.musicMute)}
                          >
                            {musicMuted ? '🔇' : (musicaInAttesaDiGesto ? '🔈' : '🔊')}
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotifPanel(p => !p)}
                          className="btn-secondary px-3 py-2"
                          style={{fontSize: '0.8rem', position: 'relative'}}
                          aria-label={t.social.notifications}
                        >
                          🔔{notifItems.length > 0 && (
                            <span style={{
                              position: 'absolute', top: '-4px', right: '-4px',
                              background: '#ef4444', color: '#fff',
                              borderRadius: '9999px', fontSize: '0.6rem',
                              fontWeight: 700, minWidth: '16px', height: '16px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0 3px'
                            }}>{notifItems.length}</span>
                          )}
                        </button>
                        {showNotifPanel && (
                          <div style={{
                            position: 'absolute', right: 0, top: '2.5rem',
                            width: '300px', background: '#1a1d2e',
                            border: '1px solid rgba(124,58,237,0.35)',
                            borderRadius: '0.75rem', padding: '0.75rem',
                            zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                          }}>
                            {notifItems.length === 0 ? (
                              <p style={{color: '#a78bfa', fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem'}}>{t.noNotifications}</p>
                            ) : (
                              <>
                                {notifItems.map(n => {
                                  const tabTarget = n.type === 'telepathy_invite' ? 'telepathy' : n.type === 'comment' ? 'consciousness' : n.type === 'private_message' ? null : 'rituals';
                                  const icon = n.type === 'comment' || n.type === 'ritual_comment' ? '💬' : n.type === 'ritual_join' ? '🌟' : n.type === 'private_message' ? '✉️' : n.type === 'telepathy_declined' ? '❌' : '🧠';
                                  // Viva solo se il server ha un invito aperto per me (ce n'è al massimo uno).
                                  const isExpiredInvite = n.type === 'telepathy_invite' && !incomingInvite;
                                  return (
                                  <div
                                    key={n.id}
                                    data-test="notifica"
                                    onClick={isExpiredInvite ? () => markOneNotifRead(n, tabTarget) : undefined}
                                    style={{
                                    padding: '0.5rem 0.25rem',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    opacity: isExpiredInvite ? 0.6 : 1,
                                    cursor: isExpiredInvite ? 'pointer' : 'default'
                                  }}>
                                    <span style={{fontSize: '1rem'}}>{icon}</span>
                                    <span style={{flex: 1, color: '#e5e7eb', fontSize: '0.82rem'}}>
                                      {window.NotificheHelpers ? window.NotificheHelpers.testoNotifica(n, lang) : n.message}
                                      {isExpiredInvite && (
                                        <span style={{
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
                                        }}>{t.telepathy.inviteExpired}</span>
                                      )}
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); markOneNotifRead(n, tabTarget); }}
                                      className="btn-primary"
                                      style={{fontSize: '0.75rem', padding: '0.2rem 0.6rem', whiteSpace: 'nowrap'}}
                                    >{isExpiredInvite ? t.ok : t.go}</button>
                                  </div>);
                                })}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <button onClick={() => setShowLogoutConfirm(true)} className="btn-secondary px-3 py-2" style={{fontSize: '0.8rem'}}>
                        {t.logout}
                      </button>
                    </div>
                  </div>
                </div>
              </header>

              <div className="container" style={{paddingTop: '1rem'}}>
                {renderInstallBanner()}
              </div>

              <div className="container py-3">
                <div className="bg-glass rounded-2xl p-4 border-glass" style={{background: 'rgba(124, 58, 237, 0.12)', border: '1px solid rgba(124, 58, 237, 0.2)'}}>
                  <div className="grid grid-cols-3 gap-4 text-center stats-grid">
                    <div>
                      <div className="text-2xl font-bold text-white">{rituals.length}</div>
                      <div className="text-secondary text-xs">{t.stats.activeRituals}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold" style={{color: '#fbbf24'}}>{totalRounds}</div>
                      <div className="text-secondary text-xs">{t.stats.roundsPlayed}</div>
                    </div>
                    <div
                      onClick={() => {
                        setActiveTab('consciousness');
                        // Aspetta il re-render del tab consciousness, poi scrolla a Community
                        setTimeout(() => {
                          document.getElementById('community-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }}
                      style={{cursor: 'pointer'}}
                      title={t.seeOnlineUsers}
                    >
                      <div className="text-2xl font-bold" style={{color: '#4ade80', textDecoration: 'underline', textDecorationColor: 'rgba(74,222,128,0.4)', textUnderlineOffset: '0.2rem'}}>{onlineUsers.length}</div>
                      <div className="text-secondary text-xs">{t.stats.onlineNow}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="container main-nav-top" style={{paddingTop: '0.5rem'}}>
                <div className="flex gap-2 bg-glass rounded-2xl p-3" style={{overflowX: 'auto'}}>
                  {['rituals', 'telepathy', 'consciousness'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-2 px-3 rounded-xl font-medium transition-all ${
                        activeTab === tab ? 'tab-active' : 'tab-inactive'
                      }`}
                      style={{whiteSpace: 'nowrap', flex: '1', textAlign: 'center', fontSize: 'clamp(0.75rem, 2.5vw, 1rem)', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem'}}
                    >
                      {t.tabs[tab]}
                      {tab === 'telepathy' && partner && !sessionEnded && !partnerDisconnected && (
                        <span
                          className="training-badge pulse-glow"
                          style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            background: '#a78bfa',
                            borderRadius: '50%',
                            marginLeft: '0.4rem',
                            boxShadow: '0 0 8px #a78bfa',
                            verticalAlign: 'middle'
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigazione principale in basso — visibile solo su mobile (via CSS .main-nav-bottom) */}
              <nav className="main-nav-bottom" aria-label={t.mainSections}>
                {['rituals', 'telepathy', 'consciousness'].map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`nav-item ${activeTab === tab ? 'on' : ''}`} aria-current={activeTab === tab ? 'page' : undefined}>
                    <span className="nav-ic" aria-hidden="true">{ {rituals: '🕯️', telepathy: '🔮', consciousness: '🌌'}[tab] }</span>
                    <span className="nav-lb">{t.tabs[tab]}</span>
                    {tab === 'telepathy' && partner && !sessionEnded && !partnerDisconnected && (
                      <span className="training-badge pulse-glow" style={{position: 'absolute', top: '7px', right: 'calc(50% - 22px)', width: '8px', height: '8px', background: '#a78bfa', borderRadius: '50%', boxShadow: '0 0 8px #a78bfa'}} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </nav>

              <div className="container py-6">
                {activeTab === 'rituals' && (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-3xl font-bold text-white mb-2">{t.rituals.title}</h2>
                        <p className="text-primary">{t.rituals.subtitle}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={createTestRitual} className="btn-secondary" style={{fontSize: '0.8rem'}}>
                          {t.rituals.testRitual}
                        </button>
                        <button onClick={() => setShowCreateRitual(true)} className="btn-primary">
                          {t.rituals.createRitual}
                        </button>
                      </div>
                    </div>

                    {rituals.length === 0 && (
                      <div className="bg-glass rounded-2xl text-center border-glass" style={{maxWidth: '380px', margin: '2rem auto', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem'}}>
                        <div style={{fontSize: '3.5rem', lineHeight: 1}}>🌟</div>
                        <p className="text-white" style={{margin: 0}}>{t.rituals.noRituals}</p>
                      </div>
                    )}

                    {/* La nostra domanda, prima del popup del browser. Compare solo dopo un
                        «Partecipa»: è l'unico momento in cui la richiesta ha un senso evidente. */}
                    {chiediPush && (
                      <div data-test="push-chiedi" className="bg-glass rounded-2xl border-glass" style={{padding: '1rem 1.25rem', marginBottom: '1rem'}}>
                        <p className="text-white text-sm" style={{marginTop: 0, marginBottom: '0.75rem'}}>{t.pushChiedi}</p>
                        <div className="flex gap-2">
                          <button data-test="push-si" onClick={() => rispondiPush(true)} className="btn-primary">{t.pushSi}</button>
                          <button data-test="push-no" onClick={() => rispondiPush(false)} className="btn-secondary">{t.pushNo}</button>
                        </div>
                      </div>
                    )}

                    {/* iPhone in Safari non installato: lì le notifiche non esistono proprio,
                        e chiedere il permesso non è nemmeno possibile. */}
                    {mostraInstallaPerPush && (
                      <div data-test="push-installa-ios" className="bg-glass rounded-2xl border-glass" style={{padding: '1rem 1.25rem', marginBottom: '1rem'}}>
                        <p className="text-white text-sm" style={{margin: 0}}>{t.pushIosInstalla}</p>
                        <button onClick={() => setMostraInstallaPerPush(false)} className="btn-secondary" style={{marginTop: '0.75rem'}}>{t.ok}</button>
                      </div>
                    )}

                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem'}}>
                      {rituals.map(ritual => {
                        const status = getRitualStatus(ritual);
                        const isLive = status === 'live';
                        const isJoined = ritual.participants.includes(sessionId);
                        const candleCount = (ritual.candles || []).length;
                        const isCandleLit = (ritual.candles || []).includes(sessionId);
                        
                        const ricorrente = Array.isArray(ritual.ripeti_giorni);
                        // Per un rituale che si ripete il cestino vale solo prima che la serie sia
                        // partita (primo appuntamento nel futuro); dopo si «ferma», non si cancella.
                        const primoIstante = ricorrente ? new Date(`${ritual.prima_date}T${ritual.prima_time}Z`) : null;
                        const serieNonPartita = ricorrente && primoIstante > new Date();
                        const serieIniziata = ricorrente && !serieNonPartita;
                        const ritualComments = ritualCommentsMap[ritual.id] || [];
                        const isRitualExpanded = expandedRitualId === ritual.id;
                        return (
                          <div key={ritual.id} className={`ritual-card ${isLive ? 'ritual-live' : ''}`}>
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div style={{fontSize: '2rem'}} className="mb-2">{ritualTypes.find(t => t.id === ritual.type)?.icon}</div>
                                <h3 className="text-xl font-bold text-white mb-1">{ritual.name}</h3>
                                {Array.isArray(ritual.ripeti_giorni) && (
                                  <p data-test="ritual-recurrence" className="text-sm" style={{color: '#c4b5fd'}}>
                                    🔁 {descriviRipetizione(ritual)} · {t.rituals.dayOf(ritual.occorrenza_numero, ritual.occorrenze_totali)}
                                  </p>
                                )}
                                {/* Sulla scheda bastano tre righe: il testo intero (fino a 2000 caratteri) si legge nella stanza. */}
                                <p className="text-secondary text-sm" data-test="ritual-desc"
                                  style={{display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line'}}>{ritual.description}</p>
                                {ritual.creator && (
                                  <span
                                    className="text-xs"
                                    style={{color: '#a78bfa', cursor: 'pointer', textDecoration: 'underline dotted'}}
                                    onClick={() => openProfile(ritual.creator)}
                                  >✦ {ritual.creator}</span>
                                )}
                              </div>
                              <div className="flex items-start gap-1">
                                <div className="text-2xl" style={{color: '#fbbf24'}}>{ritual.sacred_number}</div>
                                {moderationMenu({ author: ritual.creator, type: 'ritual', id: ritual.id, snapshot: `${ritual.name}
${ritual.description || ''}` })}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                              <Calendar style={{width: '1rem', height: '1rem', color: '#a78bfa'}} />
                              <span className="text-primary text-sm">{formatRitualWhen(ritual)}</span>
                            </div>

                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <Users style={{width: '1rem', height: '1rem', color: '#a78bfa'}} />
                                <span className="text-white text-sm">{ritual.participants.length} {t.rituals.participants}</span>
                              </div>
                              <span className="text-sm" style={{color: isLive ? '#4ade80' : '#fbbf24'}}>
                                {isLive ? t.rituals.live : (status === 'ended' ? t.rituals.ended : `${t.rituals.startsIn} ${status}`)}
                              </span>
                            </div>

                            {/* flexWrap: con «Entra» un rituale in corso del proprio creatore ha fino a
                                cinque pulsanti, e su una riga sola «Ferma» usciva dalla scheda, finendo
                                sotto la scheda accanto (irraggiungibile). */}
                            <div className="flex gap-2 mb-3" style={{flexWrap: 'wrap'}}>
                              <button
                                data-test="join-ritual"
                                onClick={() => joinRitual(ritual.id)}
                                className={isJoined ? 'btn-secondary flex-1' : 'btn-primary flex-1'}
                                disabled={isJoined || status === 'ended'}
                              >
                                {isJoined ? t.rituals.joined : t.rituals.join}
                              </button>
                              {/* La stanza si apre solo mentre il rituale è in corso: prima e dopo non c'è
                                  nessuno dentro, e la preghiera si legge già sulla scheda. */}
                              {isLive && (
                                <button data-test="open-room" onClick={() => setStanzaId(ritual.id)} className="btn-primary px-4">
                                  {t.rituals.enterRoom} 🕯️
                                </button>
                              )}
                              {isLive && (
                                <button onClick={() => sendEnergy(ritual.id)} className="btn-secondary px-4">
                                  ⚡ {ritual.energy}
                                </button>
                              )}
                              {/* Sulla scheda la candela si conta soltanto: si accende nella stanza,
                                  durante il rituale, dove si prega insieme. */}
                              <span
                                data-test="card-candles"
                                className="px-4"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  borderRadius: '0.75rem',
                                  border: isCandleLit ? '1px solid rgba(251,191,36,0.7)' : '1px solid rgba(255,255,255,0.2)',
                                  background: isCandleLit ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.06)',
                                  color: '#fff'
                                }}
                              >
                                <span style={{filter: isCandleLit ? 'none' : 'grayscale(1) opacity(0.6)'}}>🕯️</span> {candleCount}
                              </span>
                              {/* Solo a chi l'ha creato, e solo finche' non e' iniziato: dentro
                                  un rituale in corso c'e' gente che sta meditando, e non deve
                                  vederselo sparire sotto gli occhi. */}
                              {ritual.creator_id === sessionId && (ricorrente ? serieNonPartita : (status !== 'live' && status !== 'ended')) && (
                                <button
                                  data-test="delete-ritual"
                                  onClick={() => setRitualToDelete(ritual)}
                                  className="px-4"
                                  aria-label={t.rituals.deleteRitual}
                                  title={t.rituals.deleteRitual}
                                  style={{
                                    borderRadius: '0.75rem',
                                    border: '1px solid rgba(248,113,113,0.5)',
                                    background: 'rgba(248,113,113,0.12)',
                                    color: '#fca5a5',
                                    cursor: 'pointer'
                                  }}
                                >🗑️</button>
                              )}
                              {isJoined && ritual.creator_id !== sessionId && (
                                <button data-test="leave-ritual" className="btn-secondary px-4" onClick={() => leaveRitual(ritual.id)}>
                                  {t.rituals.leave}
                                </button>
                              )}
                              {ritual.creator_id === sessionId && serieIniziata && !ritual.fermato_il && (
                                <button
                                  data-test="stop-ritual"
                                  onClick={() => setRitualToStop(ritual)}
                                  className="btn-secondary px-4"
                                >{t.rituals.stop}</button>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => toggleRitualComments(ritual.id)}
                                className="btn-secondary"
                                style={{fontSize: '0.8rem', padding: '0.45rem 0.85rem', minHeight: '40px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}
                              >
                                {isRitualExpanded ? t.feed.hideComments : t.feed.showComments}
                                {ritualComments.length > 0 ? ` (${ritualComments.length})` : ''}
                              </button>
                              <button
                                onClick={() => toggleRitualComments(ritual.id)}
                                className="btn-primary"
                                style={{fontSize: '0.8rem', padding: '0.45rem 0.85rem', minHeight: '40px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}
                              >
                                {t.feed.comment}
                              </button>
                            </div>

                            {isRitualExpanded && (
                              <div style={{marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)'}}>
                                {ritualComments.map(c => { const commentKind = 'ritual_comment'; return (
                                  <div key={c.id} style={{marginBottom: '0.75rem', paddingLeft: '1rem', borderLeft: '2px solid rgba(124,58,237,0.4)'}}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className="text-primary font-medium text-xs"
                                        style={{cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(167,139,250,0.4)'}}
                                        onClick={() => openProfile(c.author_nickname)}
                                      >{c.author_nickname}</span>
                                      <span style={{color: '#c4b5fd'}} className="text-xs">{new Date(c.created_at).toLocaleTimeString(LOC)}</span>
                                      {moderationMenu({ author: c.author_nickname, type: commentKind, id: c.id, snapshot: c.content })}
                                    </div>
                                    <p className="text-white" style={{fontSize: '0.9rem'}}>{c.content}</p>
                                  </div>
                                ); })}
                                <div className="flex gap-2" style={{marginTop: '0.75rem'}}>
                                  <input
                                    type="text"
                                    value={newRitualCommentContents[ritual.id] || ''}
                                    onChange={(e) => setNewRitualCommentContents(prev => ({ ...prev, [ritual.id]: e.target.value }))}
                                    onKeyPress={(e) => e.key === 'Enter' && createRitualComment(ritual.id)}
                                    placeholder={t.feed.addComment}
                                    style={{flex: 1, fontSize: '0.875rem'}}
                                  />
                                  <button onClick={() => createRitualComment(ritual.id)} className="btn-primary px-4 py-2" style={{fontSize: '0.85rem'}}>
                                    {t.feed.comment}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'consciousness' && (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>

                    {/* Feed Section */}
                    <div>
                      <div className="mb-4">
                        <h2 className="text-3xl font-bold text-white mb-2">{t.feed.title}</h2>
                        <p className="text-primary">{t.feed.subtitle}</p>
                      </div>

                      {/* New post form */}
                      <div className="bg-glass rounded-2xl border-glass p-4 mb-4">
                        <textarea
                          value={newPostContent}
                          onChange={(e) => setNewPostContent(e.target.value)}
                          placeholder={t.feed.newPostPlaceholder}
                          aria-label={t.feed.newPostPlaceholder}
                          rows={3}
                          style={{width: '100%', resize: 'vertical', marginBottom: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.75rem', color: '#fff', padding: '0.75rem', fontSize: '0.95rem'}}
                          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) createPost(); }}
                        />
                        <div style={{textAlign: 'right'}}>
                          <button onClick={createPost} className="btn-primary" disabled={!newPostContent.trim() || savingContent}>
                            {savingContent ? '…' : t.feed.post}
                          </button>
                        </div>
                      </div>

                      {/* Posts list */}
                      {posts.length === 0 && (
                        <div className="bg-glass rounded-2xl p-10 text-center border-glass">
                          <div style={{fontSize: '3rem'}} className="mb-3">💭</div>
                          <p className="text-white">{t.feed.noFeed}</p>
                        </div>
                      )}

                      {posts.map(post => {
                        const postComments = commentsMap[post.id] || [];
                        const isExpanded = expandedPostId === post.id;
                        return (
                          <div key={post.id} className="bg-glass rounded-2xl border-glass p-4 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="text-primary font-medium text-sm"
                                style={{cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(167,139,250,0.4)'}}
                                onClick={() => openProfile(post.author_nickname)}
                              >{post.author_nickname}</span>
                              <span style={{color: '#c4b5fd'}} className="text-xs">{new Date(post.created_at).toLocaleString(LOC)}</span>
                              {moderationMenu({ author: post.author_nickname, type: 'post', id: post.id, snapshot: post.content })}
                            </div>
                            <p className="text-white" style={{marginBottom: '0.75rem', lineHeight: '1.5'}}>{post.content}</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => togglePostComments(post.id)}
                                className="btn-secondary"
                                style={{fontSize: '0.8rem', padding: '0.45rem 0.85rem', minHeight: '40px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}
                              >
                                {isExpanded ? t.feed.hideComments : t.feed.showComments}
                                {postComments.length > 0 ? ` (${postComments.length})` : ''}
                              </button>
                              <button
                                onClick={() => togglePostComments(post.id)}
                                className="btn-primary"
                                style={{fontSize: '0.8rem', padding: '0.45rem 0.85rem', minHeight: '40px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}
                              >
                                {t.feed.comment}
                              </button>
                            </div>

                            {isExpanded && (
                              <div style={{marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)'}}>
                                {postComments.map(c => { const commentKind = 'post_comment'; return (
                                  <div key={c.id} style={{marginBottom: '0.75rem', paddingLeft: '1rem', borderLeft: '2px solid rgba(124,58,237,0.4)'}}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className="text-primary font-medium text-xs"
                                        style={{cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(167,139,250,0.4)'}}
                                        onClick={() => openProfile(c.author_nickname)}
                                      >{c.author_nickname}</span>
                                      <span style={{color: '#c4b5fd'}} className="text-xs">{new Date(c.created_at).toLocaleTimeString(LOC)}</span>
                                      {moderationMenu({ author: c.author_nickname, type: commentKind, id: c.id, snapshot: c.content })}
                                    </div>
                                    <p className="text-white" style={{fontSize: '0.9rem'}}>{c.content}</p>
                                  </div>
                                ); })}
                                <div className="flex gap-2" style={{marginTop: '0.75rem'}}>
                                  <input
                                    type="text"
                                    value={newCommentContents[post.id] || ''}
                                    onChange={(e) => setNewCommentContents(prev => ({ ...prev, [post.id]: e.target.value }))}
                                    onKeyPress={(e) => e.key === 'Enter' && createComment(post.id)}
                                    placeholder={t.feed.addComment}
                                    aria-label={t.feed.addComment}
                                    style={{flex: 1, fontSize: '0.875rem'}}
                                  />
                                  <button onClick={() => createComment(post.id)} className="btn-primary px-4 py-2" style={{fontSize: '0.85rem'}}>
                                    {t.feed.comment}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Map Section */}
                    <div>
                      <div className="mb-4">
                        <h2 className="text-3xl font-bold text-white mb-2">{t.map.title}</h2>
                        <p className="text-primary">{t.map.subtitle}</p>
                      </div>

                      <div className="map-container">
                        <img
                          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 500'%3E%3Crect fill='%23111827' width='1000' height='500'/%3E%3Cpath fill='%231f2937' d='M0 250 Q 250 200 500 250 T 1000 250 L 1000 500 L 0 500 Z'/%3E%3C/svg%3E"
                          alt={t.worldMapAlt}
                          style={{width: '100%', height: '100%', objectFit: 'cover'}}
                        />
                        {onlineUsers.map(user => {
                          const x = ((user.lng + 180) / 360) * 100;
                          const y = ((90 - user.lat) / 180) * 100;

                          return (
                            <React.Fragment key={user.id}>
                              <div
                                className="map-point"
                                style={{left: `${x}%`, top: `${y}%`}}
                                title={`${user.avatar || ''} ${user.nickname}`}
                                onClick={() => openProfile(user.nickname)}
                              />
                              <div
                                className="map-ripple ripple"
                                style={{left: `${x}%`, top: `${y}%`}}
                              />
                            </React.Fragment>
                          );
                        })}
                      </div>

                      <div className="mt-4 text-center">
                        <span className="text-white text-lg font-bold">{onlineUsers.length}</span>
                        <span className="text-primary ml-2">{t.map.visible}</span>
                      </div>

                      {/* Community List */}
                      <div id="community-section" className="mt-6">
                        <h3 className="text-xl font-bold text-white mb-3">{t.social.community}</h3>
                        <div className="bg-glass rounded-2xl border-glass p-4" style={{maxHeight: '300px', overflowY: 'auto'}}>
                          {onlineUsers.map(user => (
                            <div
                              key={user.id}
                              className="flex items-center gap-3 p-3 rounded-xl transition-all"
                              style={{cursor: 'pointer', background: 'rgba(255,255,255,0.05)', marginBottom: '0.5rem'}}
                              onClick={() => openProfile(user.nickname)}
                              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            >
                              <span style={{fontSize: '1.5rem'}}>{user.avatar || '👤'}</span>
                              <span className="text-white font-medium">{user.nickname}</span>
                              <div className="online-dot" style={{marginLeft: 'auto'}} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'telepathy' && (
                  <div className="bg-glass rounded-2xl p-6 border-glass">
                    <div className={`text-center mb-6 ${(partner || sessionEnded) ? 'tele-header-insession' : ''}`}>
                      <Brain style={(partner || sessionEnded) ? {width: '2.25rem', height: '2.25rem', margin: '0 auto 0.3rem', color: '#a78bfa'} : {width: '4rem', height: '4rem', margin: '0 auto 1rem', color: '#a78bfa'}} />
                      <h2 className="text-3xl font-bold text-white mb-2">{t.telepathy.title}</h2>
                      <p className="text-primary">{t.telepathy.subtitle}</p>
                    </div>

                    {!partner && !searchingPartner && !sessionEnded && (
                      <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                        {/* Come funziona */}
                        <div className="bg-glass-dark rounded-xl p-4">
                          <h3 className="text-white font-bold mb-2">{t.telepathy.howItWorks}</h3>
                          <p className="text-primary text-sm">{t.telepathy.step1}</p>
                          <p className="text-primary text-sm">{t.telepathy.step2}</p>
                          <p className="text-primary text-sm">{t.telepathy.step3}</p>
                        </div>

                        <div className="bg-glass-dark rounded-xl p-4">{renderInterruttoreInviti('interruttore-inviti')}</div>

                        {invitoInUscita && (
                          <div className="bg-glass-dark rounded-xl p-4" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem'}}>
                            {/* «Invito inviato...» resta: test-telepathy.js lo cerca dopo «Proponi». */}
                            <span data-test="conto-invito" className="text-white text-sm">
                              {t.telepathy.inviteSent} {testoInviti('invito_a', { nome: invitoInUscita.nome, tempo: (() => {
                                const s = IH ? IH.secondiRimasti(invitoInUscita.expires_at, scartoOrologio, adessoLocale) : 0;
                                return s > 0 ? testoInviti('scade_fra', { tempo: IH.mmss(s) }) : testoInviti('scaduto_breve');
                              })() })}
                            </span>
                            <button data-test="annulla-invito" onClick={cancelDirectInvite} className="text-secondary text-xs"
                              style={{textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0}}>
                              {t.telepathy.cancel}
                            </button>
                          </div>
                        )}

                        {/* Lista utenti online */}
                        {onlineInLobby.length > 0 && (
                          <div className="bg-glass-dark rounded-xl p-4">
                            <h3 className="text-white font-bold mb-3">{t.telepathy.onlineUsers} ({onlineInLobby.length})</h3>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                              {onlineInLobby.map(u => (
                                <div key={u.id} data-test="riga-online" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)'}}>
                                  <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                    <span style={{width: '0.6rem', height: '0.6rem', borderRadius: '50%', background: u.status === 'available' ? '#4ade80' : '#9ca3af', display: 'inline-block'}} />
                                    <span className="text-white text-sm font-medium" style={{cursor: 'pointer', textDecoration: 'underline dotted'}} onClick={() => apriScheda({ id: u.id, nickname: u.nickname, busy: u.status === 'busy' })}>{u.nickname}</span>
                                    <span className="text-secondary text-xs">{u.status === 'busy' ? t.telepathy.inSession : t.telepathy.available}</span>
                                  </div>
                                  {u.status === 'available' && !invitoInUscita && !directInviteTarget && (
                                    <button
                                      onClick={() => sendDirectInvite(u)}
                                      className="btn-primary"
                                      style={{fontSize: '0.75rem', padding: '0.3rem 0.75rem'}}
                                    >
                                      {t.telepathy.propose}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {invitabili.length > 0 && (
                          <div data-test="lista-disponibili" className="bg-glass-dark rounded-xl p-4">
                            <h3 className="text-white font-bold mb-3">{testoInviti('disponibili')} ({invitabili.length})</h3>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                              {invitabili.map(u => (
                                <div key={u.id} data-test="riga-disponibile" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)'}}>
                                  <span className="text-white text-sm font-medium" style={{cursor: 'pointer', textDecoration: 'underline dotted'}}
                                    onClick={() => apriScheda({ disponibilita_id: u.id, nickname: u.nickname })}>{u.nickname}</span>
                                  {!invitoInUscita && !directInviteTarget && (
                                    <button onClick={() => sendDirectInvite({ disponibilita_id: u.id, nickname: u.nickname })} className="btn-primary"
                                      style={{fontSize: '0.75rem', padding: '0.3rem 0.75rem'}}>{t.telepathy.propose}</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Abbinamento random */}
                        <button onClick={startSearching} data-test="btn-casuale" className="btn-primary w-full" style={{fontSize: '1.125rem'}}>
                          {t.telepathy.randomMatch}
                        </button>

                          {/* Classifica — in fondo alla lobby, sempre visibile */}
                          <div className="bg-glass-dark rounded-xl p-4">
                            <h3 className="text-white font-bold mb-3">🏆 {t.telepathy.leaderboardTitle}</h3>
                            {leaderboard.length === 0 ? (
                              <p className="text-secondary text-sm text-center" style={{padding: '1rem'}}>{t.telepathy.leaderboardEmpty}</p>
                            ) : (
                              <div style={{display: 'flex', flexDirection: 'column', gap: '0.4rem'}}>
                                <div style={{display: 'flex', fontSize: '0.7rem', color: '#9ca3af', padding: '0 0.5rem'}}>
                                  <span style={{width: '2rem'}}>#</span>
                                  <span style={{flex: 1}}>{t.telepathy.leaderboardPlayer}</span>
                                  <span style={{width: '3.5rem', textAlign: 'right'}}>{t.telepathy.leaderboardMatches}</span>
                                  <span style={{width: '4.5rem', textAlign: 'right'}}>{t.telepathy.leaderboardAccuracy}</span>
                                </div>
                                {leaderboard.map((row, i) => (
                                  <div key={row.nickname || i} style={{display: 'flex', alignItems: 'center', padding: '0.5rem', borderRadius: '0.6rem', background: i < 3 ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)'}}>
                                    <span style={{width: '2rem', fontWeight: 700, color: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : i === 2 ? '#d97706' : '#9ca3af'}}>{i + 1}</span>
                                    <span className="text-white" style={{flex: 1, fontWeight: 600}}>{row.nickname}</span>
                                    <span className="text-white" style={{width: '3.5rem', textAlign: 'right'}}>{row.matches_count}</span>
                                    <span style={{width: '4.5rem', textAlign: 'right', color: '#4ade80'}}>{row.rounds_count > 0 ? Math.round((row.matches_count / row.rounds_count) * 100) + '%' : '—'}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button onClick={loadLeaderboard} className="btn-secondary w-full" style={{marginTop: '0.75rem', fontSize: '0.8rem'}}>{t.telepathy.leaderboardRefresh}</button>
                          </div>
                      </div>
                    )}

                    {searchingPartner && (
                      <div className="text-center" style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                        <div style={{fontSize: '4rem'}} className="pulse-glow">🔮</div>
                        <p className="text-white text-xl">{t.telepathy.searching}</p>
                        {queueSize > 1 && (
                          <div className="bg-glass-dark rounded-xl p-4">
                            <p className="text-primary">{t.telepathy.queuePosition}: <span className="text-white font-bold">{queuePosition}</span> / {queueSize}</p>
                            <p className="text-secondary text-sm mt-2">{t.telepathy.waiting(queueSize - 1)}</p>
                          </div>
                        )}
                        <button onClick={() => setSearchingPartner(false)} className="btn-secondary">{t.telepathy.cancel}</button>
                      </div>
                    )}

                    {(partner || sessionEnded) && (
                      <div className="tele-session" style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', position: 'relative'}}>
                        {partner && !sessionEnded && (
                          <button
                            onClick={() => setShowEndSessionConfirm(true)}
                            aria-label={t.telepathy.endSessionBtn}
                            title={t.telepathy.endSessionBtn}
                            style={{
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
                            }}
                          >✕</button>
                        )}
                        {partnerDisconnected && (
                          <div style={{width: '100%', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.4)', borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center', marginBottom: '0.5rem'}}>
                            <div style={{fontSize: '2rem', marginBottom: '0.4rem'}}>📡</div>
                            <p className="text-white font-bold mb-2">{partner?.nickname || t.telepathy.yourPartnerFallback} {t.telepathy.partnerLeftSuffix}</p>
                            <button onClick={resetTelepathy} className="btn-primary">{t.telepathy.backToLobby}</button>
                          </div>
                        )}

                        {/* SINISTRA: riepilogo sessione + status partner */}
                        <div className="tele-col tele-col-info" style={{flex: '0 0 180px', minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                          <div className="bg-glass-dark rounded-xl p-4">
                            <p className="text-secondary text-xs mb-1">{t.telepathy.partner}</p>
                            <p data-test="partner-nome" className="text-white font-bold">{partner?.nickname}</p>
                            <p className="text-secondary text-xs mt-2">{t.telepathy.yourRole}</p>
                            <p className="text-white font-bold">{effectiveRole === 'sender' ? t.telepathy.roleSender : t.telepathy.roleReceiver}</p>
                          </div>
                          <div className="bg-glass-dark rounded-xl p-4" style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between'}}>
                              <span className="text-secondary text-xs">{t.telepathy.roundLabel}</span>
                              <span className="text-white text-sm font-bold">{roundCount}</span>
                            </div>
                            <div style={{display: 'flex', justifyContent: 'space-between'}}>
                              <span className="text-secondary text-xs">{t.telepathy.matchLabel}</span>
                              <span className="text-white text-sm font-bold">{sessionMatches}/{roundCount || 0}</span>
                            </div>
                            <div style={{display: 'flex', justifyContent: 'space-between'}}>
                              <span className="text-secondary text-xs">{t.telepathy.levelLabel}</span>
                              <span className="text-white text-sm font-bold">{levelLabel(currentLevel)}</span>
                            </div>
                            {roundCount > 0 && (
                              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                                <span className="text-secondary text-xs">{t.telepathy.accuracyLabel}</span>
                                <span className="text-sm font-bold" style={{color: '#4ade80'}}>{Math.round((sessionMatches / roundCount) * 100)}%</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* CENTRO: area di gioco */}
                        <div className="tele-col tele-col-game" style={{flex: '1 1 280px', minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                          {partner && !sessionEnded && (
                            <div
                              className={`bg-glass-dark rounded-xl ${isMyTurn() ? 'pulse-glow' : ''}`}
                              style={{
                                padding: '0.9rem 1.1rem',
                                border: '1px solid rgba(167,139,250,0.45)',
                                background: 'rgba(167,139,250,0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                              }}
                            >
                              <span style={{fontSize: '1.5rem'}}>🔮</span>
                              <p
                                className="text-white"
                                style={{fontSize: '1.05rem', fontWeight: 500, margin: 0, lineHeight: 1.3}}
                              >
                                {getPartnerStatus()}
                              </p>
                            </div>
                          )}
                          {partner && !showResult && !sessionEnded && (
                            <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                              {/* Banner proposta cambio livello */}
                              {showLevelBanner && (
                                amIChooser ? (
                                  <div className="bg-glass-dark rounded-xl p-4" style={{border: '1px solid rgba(167,139,250,0.5)'}}>
                                    <p className="text-white font-bold text-center mb-3">{t.telepathy.levelChooseTitle}</p>
                                    <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                                      {[{m: 'lvl3', ic: '🔣', lb: levelLabel('lvl3')}, {m: 'lvl5', ic: '🔣', lb: levelLabel('lvl5')}, {m: 'lvl7', ic: '🔣', lb: levelLabel('lvl7')}, {m: 'lvl9', ic: '🔣', lb: levelLabel('lvl9')}, {m: 'numbers', ic: '🔢', lb: t.telepathy.levelNumbers}, {m: 'words', ic: '🔤', lb: t.telepathy.levelWords}].filter(o => o.m !== currentLevel).map(o => (
                                        <button key={o.m} onClick={() => proposeLevelChange(o.m)} className="btn-secondary" style={{flex: '1 1 45%', fontSize: '0.85rem'}}>{o.ic} {o.lb}</button>
                                      ))}
                                      <button onClick={() => proposeLevelChange('keep')} className="btn-secondary" style={{flex: '1 1 45%', fontSize: '0.85rem'}}>{t.telepathy.levelKeep}</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div role="status" className="bg-glass-dark rounded-xl p-4" style={{border: '1px solid rgba(167,139,250,0.5)', textAlign: 'center'}}>
                                    <p className="text-white" style={{margin: 0}}>🔮 {partner?.nickname} {t.telepathy.levelWaiting}</p>
                                  </div>
                                )
                              )}

                              {!showLevelBanner && effectiveRole === 'sender' && !waitingForPartner && (
                                <div>
                                  <p className="text-white text-center mb-2 font-medium">{t.telepathy.pickSymbol}</p>
                                  <div className="grid grid-cols-3" style={{gap: '0.6rem', marginBottom: '0.75rem'}}>
                                    {getCurrentSymbols(currentLevel).map((symbol) => (
                                      <button key={symbol.id} onClick={() => setSelectedSymbol(symbol.id)} className={`symbol-btn ${selectedSymbol === symbol.id ? 'symbol-btn-selected' : ''}`}>
                                        {symbol.icon}
                                      </button>
                                    ))}
                                  </div>
                                  <button onClick={sendSymbol} disabled={!selectedSymbol || !!attesaInvitante} className="btn-primary w-full">{t.telepathy.sendTelepathically}</button>
                                </div>
                              )}

                              {!showLevelBanner && effectiveRole === 'receiver' && !waitingForPartner && (
                                <div>
                                  {senderHasSent ? (
                                    <p className="text-white text-center mb-2 font-medium">{t.telepathy.symbolSentGuess}</p>
                                  ) : (
                                    <p className="text-primary text-center mb-2 font-medium">⏳ {partner?.nickname} {t.telepathy.waitingForSend}</p>
                                  )}
                                  <div className={`grid grid-cols-3 ${!senderHasSent ? 'symbols-locked' : ''}`} style={{gap: '0.6rem', marginBottom: '0.75rem'}}>
                                    {getCurrentSymbols(currentLevel).map((symbol) => (
                                      <button key={symbol.id} disabled={!senderHasSent} onClick={() => setGuessedSymbol(symbol.id)} className={`symbol-btn ${guessedSymbol === symbol.id ? 'symbol-btn-selected' : ''}`}>
                                        {symbol.icon}
                                      </button>
                                    ))}
                                  </div>
                                  <button onClick={submitGuess} disabled={!guessedSymbol || !senderHasSent || !!attesaInvitante} className="btn-primary w-full">{t.telepathy.confirm}</button>
                                </div>
                              )}

                              {!showLevelBanner && waitingForPartner && (
                                <div className="text-center">
                                  <div style={{fontSize: '4rem'}} className="pulse-glow mb-4">🔮</div>
                                  <p className="text-primary">
                                    {effectiveRole === 'sender' ? t.telepathy.senderWaiting : t.telepathy.receiverWaiting}
                                  </p>
                                </div>
                              )}

                              {/* A2: uscita anti-stallo nelle sole attese (bug 5) — nel turno attivo
                                  basta la ✕ Termina Sessione; qui invece si potrebbe restare appesi. */}
                              {(showLevelBanner || waitingForPartner || (effectiveRole === 'receiver' && !senderHasSent)) && (
                                <button onClick={leaveSession} className="btn-secondary w-full" style={{marginTop: '0.25rem'}}>
                                  {t.telepathy.leaveSession}
                                </button>
                              )}
                            </div>
                          )}

                          {showResult && !partnerDisconnected && !sessionEnded && (
                            <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                              <div className={`${isMatch ? 'result-success' : 'result-try-again'} rounded-xl p-6 text-center`}>
                                <div style={{fontSize: '4rem'}} className="mb-4">{isMatch ? '✨' : '🌟'}</div>
                                <h3 className="text-2xl font-bold mb-2" style={{color: isMatch ? '#4ade80' : '#fb923c'}}>
                                  {isMatch ? t.telepathy.matchResult : t.telepathy.noMatch}
                                </h3>
                                <div className="flex justify-center gap-6 mb-3" style={{marginTop: '0.5rem'}}>
                                  <div className="text-center">
                                    <p className="text-secondary text-sm mb-1">{t.telepathy.sentLabel}</p>
                                    <span style={{fontSize: '2.5rem', color: '#e9d5ff'}}>{getCurrentSymbols(resultLevel || currentLevel).find(s => s.id === ((resultRole || effectiveRole) === 'sender' ? selectedSymbol : partnerSymbol))?.icon || '·'}</span>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-secondary text-sm mb-1">{t.telepathy.guessedLabel}</p>
                                    <span style={{fontSize: '2.5rem', color: '#e9d5ff'}}>{getCurrentSymbols(resultLevel || currentLevel).find(s => s.id === ((resultRole || effectiveRole) === 'receiver' ? guessedSymbol : partnerSymbol))?.icon || '·'}</span>
                                  </div>
                                </div>
                                {isMatch && <p className="text-white">{t.telepathy.resonance}</p>}
                              </div>
                              {!showLevelBanner && (
                                <div style={{textAlign: 'center', color: '#a78bfa', fontWeight: 700}}>
                                  <div style={{fontSize: '0.95rem', opacity: 0.85}}>{t.telepathy.nextMatchIn}</div>
                                  <div className="pulse-glow" style={{fontSize: '3rem', lineHeight: 1.1}}>{resultCountdown ?? 4}</div>
                                </div>
                              )}
                              <button onClick={endSession} className="btn-secondary py-3 font-bold w-full">{t.telepathy.endSessionBtn}</button>
                            </div>
                          )}

                          {sessionEnded && !partnerDisconnected && (
                            <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                              <div className="bg-glass-dark rounded-xl p-6 text-center">
                                <div style={{fontSize: '4rem'}} className="mb-4">🌟</div>
                                <h3 className="text-2xl font-bold text-white mb-4">{t.telepathy.sessionComplete}</h3>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                  <div><p className="text-secondary text-sm mb-1">{t.telepathy.roundsPlayed}</p><p className="text-2xl font-bold text-white">{roundCount}</p></div>
                                  <div><p className="text-secondary text-sm mb-1">{t.telepathy.correctMatches}</p><p className="text-2xl font-bold" style={{color: '#4ade80'}}>{sessionMatches}</p></div>
                                </div>
                                {roundCount > 0 && <p className="text-white">{t.telepathy.accuracyColon} <span className="font-bold" style={{color: '#fbbf24'}}>{Math.round((sessionMatches / roundCount) * 100)}%</span></p>}
                              </div>
                              {isGuest && guestCode && (
                                <div style={{padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', textAlign: 'center'}}>
                                  <p style={{color: '#fbbf24', fontSize: '0.8rem', marginBottom: '0.25rem'}}>{t.guestCodeLabel}: <strong style={{letterSpacing: '0.02em'}}>{guestCode}</strong></p>
                                  <p style={{color: 'rgba(251,191,36,0.85)', fontSize: '0.7rem', lineHeight: 1.35, marginBottom: 0}}>{t.guestCodeHint}</p>
                                </div>
                              )}
                              <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                                <button onClick={playAgainSamePartner} className="btn-primary w-full">{t.telepathy.playAgainWith} {partner?.nickname}</button>
                                <button onClick={resetTelepathy} className="btn-secondary w-full">{t.telepathy.backToLobbyCap}</button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* DESTRA: chat con il partner */}
                        {partner && !sessionEnded && (
                          <div className={`tele-col tele-col-chat ${telepathyChatOpen ? 'chat-open' : ''}`} style={{flex: '0 0 200px', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                            <div className="bg-glass-dark rounded-xl p-3">
                              <div className="tele-chat-header text-white text-sm font-bold mb-2" onClick={() => setTelepathyChatOpen(o => !o)} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'}}>
                                <span>💬 {t.telepathy.chatWith} {partner.nickname}</span>
                                <span className="tele-chat-chevron text-secondary" aria-hidden="true" style={{fontSize: '0.75rem'}}>{telepathyChatOpen ? '▾' : '▸'}</span>
                              </div>
                              <div style={{height: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem'}}>
                                {telepathyChatMessages.length === 0 && (
                                  <p className="text-secondary text-xs text-center" style={{marginTop: '2rem'}}>{t.telepathy.noMessages}</p>
                                )}
                                {telepathyChatMessages.map(msg => (
                                  <div key={msg.id} style={{padding: '0.3rem 0.5rem', borderRadius: '0.5rem', background: msg.sender_name === nickname ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)', alignSelf: msg.sender_name === nickname ? 'flex-end' : 'flex-start', maxWidth: '90%'}}>
                                    {msg.sender_name !== nickname && (
                                      <div className="flex items-center gap-1">
                                        <p className="text-secondary" style={{fontSize: '0.65rem'}}>{msg.sender_name}</p>
                                        {moderationMenu({ author: msg.sender_name, type: 'telepathy_chat', id: msg.id, snapshot: msg.content })}
                                      </div>
                                    )}
                                    <p className="text-white" style={{fontSize: '0.8rem'}}>{msg.content}</p>
                                  </div>
                                ))}
                              </div>
                              <div style={{display: 'flex', gap: '0.25rem'}}>
                                <input
                                  type="text"
                                  value={newTelepathyMessage}
                                  onChange={e => setNewTelepathyMessage(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && sendTelepathyMessage()}
                                  placeholder={t.telepathy.chatPlaceholder}
                                  aria-label={t.telepathy.chatPlaceholder}
                                  style={{flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0.5rem', padding: '0.3rem 0.5rem', color: 'white', fontSize: '0.8rem', outline: 'none'}}
                                />
                                <button onClick={sendTelepathyMessage} aria-label={t.messages.send} style={{background: 'rgba(139,92,246,0.5)', border: 'none', borderRadius: '0.5rem', padding: '0.3rem 0.5rem', cursor: 'pointer', color: 'white', fontSize: '0.85rem'}}>➤</button>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )}


              </div>

              {showEditProfile && (
                <div className="modal-overlay" onClick={() => setShowEditProfile(false)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setShowEditProfile(false)} aria-label={t.social.close} style={{position:'absolute',top:'1rem',right:'1rem',background:'rgba(255,255,255,0.15)',border:'none',borderRadius:'50%',width:'2rem',height:'2rem',cursor:'pointer',color:'#fff',fontSize:'1.1rem',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10}}>✕</button>
                    <div className="text-center mb-6">
                      <div style={{fontSize: '3rem'}} className="mb-2">{profile.avatar || '👤'}</div>
                      <h2 className="text-2xl font-bold text-white mb-2">{t.editProfile}</h2>
                      <div style={{marginTop: '0.5rem'}}>
                        <span style={{
                          fontSize: '0.8rem',
                          padding: '0.3rem 0.85rem',
                          borderRadius: '9999px',
                          background: isGuest ? 'rgba(251,191,36,0.2)' : 'rgba(34,197,94,0.2)',
                          color: isGuest ? '#fbbf24' : '#4ade80',
                          border: isGuest ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(34,197,94,0.4)',
                          fontWeight: 600
                        }}>{isGuest ? t.guestBadge : t.registeredBadge}</span>
                      </div>
                      {!isGuest && userEmail && (
                        <p className="text-secondary text-sm" style={{marginTop: '0.5rem'}}>{userEmail}</p>
                      )}
                      {isGuest && (
                        <div style={{marginTop: '0.75rem', padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)'}}>
                          <p style={{color: '#fbbf24', fontSize: '0.8rem', marginBottom: '0.25rem'}}>{t.guestCodeLabel}: <strong style={{letterSpacing: '0.02em'}}>{guestCode}</strong></p>
                          <p style={{color: 'rgba(251,191,36,0.85)', fontSize: '0.7rem', marginBottom: '0.7rem', lineHeight: 1.35}}>{t.guestCodeHint}</p>
                          <p style={{color: '#fbbf24', fontSize: '0.875rem'}}>{t.registerInvite}</p>
                          <button
                            onClick={() => { setShowEditProfile(false); handleLogout(); setTimeout(() => setAuthTab('register'), 100); }}
                            className="btn-primary"
                            style={{marginTop: '0.5rem', fontSize: '0.9rem', padding: '0.5rem 1.5rem'}}
                          >
                            {t.register}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Telepathy Score Display */}
                    <div className="bg-glass-dark rounded-xl p-4 mb-4">
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="text-center">
                          <p className="text-secondary text-xs mb-1">{t.social.telepathyScore}</p>
                          <p className="text-2xl font-bold" style={{color: '#fbbf24'}}>{totalRounds}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-secondary text-xs mb-1">{t.social.bestScore}</p>
                          <p className="text-2xl font-bold" style={{color: '#4ade80'}}>{totalRounds > 0 ? Math.round((totalMatches / totalRounds) * 100) : 0}%</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between" style={{padding: '0.5rem 0'}}>
                        <span className="text-white text-sm">{t.showTelepathyScore}</span>
                        <button
                          onClick={async () => {
                            const oldVal = showTelepathyScore;
                            const newVal = !oldVal;
                            setShowTelepathyScore(newVal);
                            localStorage.setItem('ga_show_telepathy', String(newVal));
                            if (!isGuest && nickname && passwordHash) {
                              // supabase.rpc non lancia: l'esito va letto, altrimenti un rifiuto
                              // lascerebbe l'interruttore acceso sullo schermo e spento nel DB.
                              const { data: esito, error } = await supabase.rpc('update_my_profile', {
                                p_nickname: nickname, p_password_hash: passwordHash,
                                p_fields: { show_telepathy_score: newVal }
                              });
                              if (error || !esito || !esito.ok) {
                                setShowTelepathyScore(oldVal);
                                localStorage.setItem('ga_show_telepathy', String(oldVal));
                                if (esito && esito.motivo === 'credenziali_non_valide') { segnalaChiaveScaduta(); return; }
                                alert(t.profileSaveFailed);
                              }
                            }
                          }}
                          style={{
                            width: '3rem',
                            height: '1.5rem',
                            borderRadius: '9999px',
                            background: showTelepathyScore ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.2)',
                            border: showTelepathyScore ? '1px solid rgba(34,197,94,0.7)' : '1px solid rgba(255,255,255,0.3)',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'all 0.3s'
                          }}
                        >
                          <div style={{
                            width: '1.1rem',
                            height: '1.1rem',
                            borderRadius: '50%',
                            background: '#fff',
                            position: 'absolute',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            left: showTelepathyScore ? 'calc(100% - 1.3rem)' : '0.15rem',
                            transition: 'all 0.3s'
                          }} />
                        </button>
                      </div>

                      {/* Notifiche push di avvio rituale. Spegnerlo scrive un segno in
                          localStorage: serve a distinguere uno spegnimento voluto — che non si
                          annulla da solo al prossimo «Partecipa» — da un abbonamento che il
                          browser ha buttato via per conto suo. */}
                      <div className="flex items-center justify-between" style={{padding: '0.5rem 0'}}>
                        <span className="text-white text-sm">{t.pushImpostazioni}</span>
                        <button
                          data-test="push-interruttore"
                          onClick={() => (pushAttive ? spegniPush() : rispondiPush(true))}
                          style={{
                            width: '3rem',
                            height: '1.5rem',
                            borderRadius: '9999px',
                            background: pushAttive ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.2)',
                            border: pushAttive ? '1px solid rgba(34,197,94,0.7)' : '1px solid rgba(255,255,255,0.3)',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'all 0.3s'
                          }}
                        >
                          <div style={{
                            width: '1.1rem',
                            height: '1.1rem',
                            borderRadius: '50%',
                            background: '#fff',
                            position: 'absolute',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            left: pushAttive ? 'calc(100% - 1.3rem)' : '0.15rem',
                            transition: 'all 0.3s'
                          }} />
                        </button>
                      </div>
                      {renderInterruttoreInviti('interruttore-inviti-impostazioni')}
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
                      {/* Avatar Emoji */}
                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.profile.avatar}</label>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(2.5rem, 1fr))', gap: '0.5rem', maxHeight: '11rem', overflowY: 'auto'}}>
                          {avatarEmojis.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => setProfile({...profile, avatar: emoji})}
                              style={{
                                fontSize: '1.5rem',
                                padding: '0.5rem',
                                borderRadius: '0.5rem',
                                border: profile.avatar === emoji ? '2px solid #a78bfa' : '2px solid transparent',
                                background: profile.avatar === emoji ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Bio */}
                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.profile.bio}</label>
                        <textarea
                          value={profile.bio}
                          onChange={(e) => setProfile({...profile, bio: e.target.value})}
                          placeholder={t.profile.bioPlaceholder}
                          rows="3"
                          maxLength={500}
                        />
                      </div>

                      {/* Country */}
                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.profile.country}</label>
                        <input
                          type="text"
                          value={profile.country}
                          onChange={(e) => setProfile({...profile, country: e.target.value})}
                          placeholder={t.profile.countryPlaceholder}
                          maxLength={100}
                        />
                      </div>

                      {/* Spiritual Interests */}
                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.profile.interests}</label>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                          {interestKeys.map(key => (
                            <button
                              key={key}
                              onClick={() => toggleInterest(key)}
                              style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '9999px',
                                border: profile.interests.includes(key) ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.2)',
                                background: profile.interests.includes(key) ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                transition: 'all 0.2s'
                              }}
                            >
                              {t.profile.interestsList[key]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Change Password — only for registered users */}
                      {!isGuest && (
                        <div>
                          <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.changePassword}</label>
                          <div style={{display: 'flex', gap: '0.5rem'}}>
                            <PasswordInput
                              autoComplete="new-password"
                              mostra={t.showPassword}
                              nascondi={t.hidePassword}
                              value={profilePassword}
                              onChange={(e) => { setProfilePassword(e.target.value); setProfilePasswordMsg(''); }}
                              placeholder={t.newPasswordPh}
                              wrapperStyle={{flex: 1}}
                            />
                            <button
                              className="btn-secondary px-4"
                              disabled={!profilePassword.trim()}
                              onClick={async () => {
                                const hash = await deriveStrongHash(profilePassword.trim());
                                const { data: esito, error } = await cambioChiave(supabase.rpc('change_password', {
                                  p_nickname: nickname, p_old_hash: passwordHash, p_new_hash: hash
                                }));
                                if (esito && esito.motivo === 'credenziali_non_valide') { segnalaChiaveScaduta(); return; }
                                if (error || !esito || !esito.ok) {
                                  setProfilePasswordMsg(t.passwordChangeFailed);
                                  return;
                                }
                                // La credenziale locale cambia SOLO se il server ha accettato: prima
                                // cambiava comunque, e da lì browser e database divergevano.
                                setPasswordHash(hash);
                                localStorage.setItem('ga_pwhash', hash);
                                setProfilePassword('');
                                setProfilePasswordMsg(t.passwordSet);
                                setTimeout(() => setProfilePasswordMsg(''), 3000);
                              }}
                            >
                              {t.changePassword}
                            </button>
                          </div>
                          {profilePasswordMsg && (
                            <div className={`${profilePasswordMsg === t.passwordChangeFailed ? 'result-try-again' : 'result-success'} rounded-xl p-2 text-center mt-2`}>
                              <p style={{color: profilePasswordMsg === t.passwordChangeFailed ? '#fb923c' : '#4ade80'}} className="font-bold text-sm">{profilePasswordMsg}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Utenti bloccati (SP1) — solo registrati */}
                      {!isGuest && (
                        <div style={{borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.25rem'}}>
                          <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.moderation.blockedUsers}</label>
                          {blockedUsers.length === 0 ? (
                            <p className="text-secondary text-xs">{t.moderation.noBlocked}</p>
                          ) : blockedUsers.map(nick => (
                            <div key={nick} className="flex items-center gap-2" style={{padding: '0.35rem 0'}}>
                              <span className="text-white text-sm">{nick}</span>
                              <button className="btn-secondary"
                                style={{marginLeft: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.7rem'}}
                                onClick={() => doUnblock(nick)}>{t.moderation.unblock}</button>
                            </div>
                          ))}
                          <a href={`regole.html#${lang}`} target="_blank" rel="noopener"
                             className="text-secondary text-xs"
                             style={{display: 'inline-block', marginTop: '0.5rem'}}>{t.moderation.reportRules}</a>
                        </div>
                      )}

                      {/* I tuoi dati (GDPR) — solo registrati */}
                      {!isGuest && (
                        <div style={{borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.25rem'}}>
                          <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.gdprTitle}</label>
                          <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                            <button
                              className="btn-secondary w-full"
                              disabled={gdprBusy}
                              onClick={exportMyData}
                            >
                              {gdprBusy ? t.gdprExporting : t.gdprExport}
                            </button>
                            <button
                              className="w-full"
                              style={{padding: '0.6rem', borderRadius: '0.75rem', border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.12)', color: '#fca5a5', cursor: 'pointer', fontWeight: 600}}
                              onClick={() => { setDeleteConfirmText(''); setShowDeleteAccount(true); }}
                            >
                              {t.gdprDelete}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Save Button */}
                      <button onClick={() => { saveProfile(); setShowEditProfile(false); }} className="btn-primary w-full" style={{fontSize: '1.125rem', marginTop: '0.5rem'}}>
                        {profileSaved ? t.profile.saved : t.profile.save}
                      </button>

                      {profileSaved && (
                        <div className="result-success rounded-xl p-3 text-center">
                          <p style={{color: '#4ade80'}} className="font-bold">{t.profile.saved}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {viewingProfile && (
                <div className="modal-overlay" onClick={() => setViewingProfile(null)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setViewingProfile(null)} aria-label={t.social.close} style={{position:'absolute',top:'1rem',right:'1rem',background:'rgba(255,255,255,0.15)',border:'none',borderRadius:'50%',width:'2rem',height:'2rem',cursor:'pointer',color:'#fff',fontSize:'1.1rem',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10}}>✕</button>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                      {viewingProfile.empty ? (
                        <div className="text-center py-4">
                          <div style={{fontSize: '4rem'}} className="mb-3">👤</div>
                          <p className="text-white text-xl font-bold mb-2">{viewingProfile.nickname}</p>
                          <p className="text-primary text-sm">{t.social.noProfile}</p>
                        </div>
                      ) : (
                        <>
                          <div className="text-center">
                            <div style={{fontSize: '4rem'}} className="mb-2">{viewingProfile.avatar || '👤'}</div>
                            <h2 className="text-2xl font-bold text-white">{viewingProfile.nickname}</h2>
                          </div>

                          {viewingProfile.bio && (
                            <div className="bg-glass-dark rounded-xl p-4">
                              <p className="text-white" style={{whiteSpace: 'pre-wrap'}}>{viewingProfile.bio}</p>
                            </div>
                          )}

                          {viewingProfile.nickname !== nickname && !isGuest && (
                            <div className="flex gap-2" style={{justifyContent: 'center'}}>
                              <button className="btn-secondary" style={{fontSize: '0.8rem'}}
                                onClick={() => setReportTarget({
                                  author: viewingProfile.nickname, type: 'profile',
                                  id: null, snapshot: viewingProfile.bio || ''
                                })}>{t.moderation.report}</button>
                              {blockedUsers.includes(viewingProfile.nickname) ? (
                                <button className="btn-secondary" style={{fontSize: '0.8rem'}}
                                  onClick={() => doUnblock(viewingProfile.nickname)}>{t.moderation.unblock}</button>
                              ) : (
                                <button className="btn-secondary" style={{fontSize: '0.8rem', color: '#fca5a5'}}
                                  onClick={() => setBlockTarget(viewingProfile.nickname)}>{t.moderation.block}</button>
                              )}
                            </div>
                          )}

                          {viewingProfile.country && (
                            <div className="bg-glass-dark rounded-xl p-3 text-center">
                              <p className="text-secondary text-xs mb-1">{t.profile.country}</p>
                              <p className="text-white font-bold">{viewingProfile.country}</p>
                            </div>
                          )}

                          {viewingProfile.interests && viewingProfile.interests.length > 0 && (
                            <div>
                              <p className="text-secondary text-xs mb-2">{t.profile.interests}</p>
                              <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                                {viewingProfile.interests.map(key => (
                                  <span
                                    key={key}
                                    style={{
                                      padding: '0.35rem 0.85rem',
                                      borderRadius: '9999px',
                                      border: '1px solid rgba(167,139,250,0.5)',
                                      background: 'rgba(139, 92, 246, 0.3)',
                                      color: '#e9d5ff',
                                      fontSize: '0.8rem'
                                    }}
                                  >
                                    {t.profile.interestsList[key] || key}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {viewingProfile.showTelepathyScore !== false && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-glass-dark rounded-xl p-3 text-center">
                                <p className="text-secondary text-xs mb-1">{t.social.telepathyScore}</p>
                                <p className="text-2xl font-bold" style={{color: '#fbbf24'}}>{viewingProfile.telepathyRounds}</p>
                              </div>
                              <div className="bg-glass-dark rounded-xl p-3 text-center">
                                <p className="text-secondary text-xs mb-1">{t.social.bestScore}</p>
                                <p className="text-2xl font-bold" style={{color: '#4ade80'}}>{viewingProfile.telepathyRounds > 0 ? Math.round((viewingProfile.telepathyMatches / viewingProfile.telepathyRounds) * 100) : 0}%</p>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Messaggi privati — solo per utenti registrati (Step B); i guest vedono il prompt */}
                      {viewingProfile.nickname !== nickname && isGuest && (
                        <div className="bg-glass-dark rounded-xl p-3 text-center">
                          <p className="text-secondary text-sm">{t.messages.guestPrompt}</p>
                        </div>
                      )}
                      {viewingProfile.nickname !== nickname && !isGuest && !viewingProfile.registered && (
                        <div className="bg-glass-dark rounded-xl p-3 text-center">
                          <p className="text-secondary text-sm">{t.messages.receiverNotRegistered}</p>
                        </div>
                      )}
                      {viewingProfile.nickname !== nickname && !isGuest && viewingProfile.registered && (
                        <div>
                          <p className="text-secondary text-xs mb-2">{t.messages.title}</p>
                          <div className="bg-glass-dark rounded-xl" style={{maxHeight: '250px', display: 'flex', flexDirection: 'column'}}>
                            <div style={{flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px'}}>
                              {getConversationMessages(viewingProfile.nickname).length === 0 ? (
                                <p className="text-secondary text-sm text-center" style={{padding: '1rem 0'}}>{t.messages.noConversations}</p>
                              ) : (
                                getConversationMessages(viewingProfile.nickname).map(msg => {
                                  const isMe = msg.sender_name === nickname;
                                  return (
                                    <div key={msg.id} style={{
                                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                                      maxWidth: '80%'
                                    }}>
                                      <div style={{
                                        padding: '0.4rem 0.75rem',
                                        borderRadius: isMe ? '0.75rem 0.75rem 0.15rem 0.75rem' : '0.75rem 0.75rem 0.75rem 0.15rem',
                                        background: isMe ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                                        border: isMe ? '1px solid rgba(139, 92, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)'
                                      }}>
                                        <p className="text-white" style={{fontSize: '0.8rem'}}>{msg.content}</p>
                                      </div>
                                      <div className="flex items-center gap-1" style={{justifyContent: isMe ? 'flex-end' : 'flex-start'}}>
                                        <p style={{fontSize: '0.6rem', color: '#c4b5fd', marginTop: '0.1rem'}}>
                                          {new Date(msg.created_at).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})}
                                        </p>
                                        {!isMe && moderationMenu({ author: msg.sender_name, type: 'private_message', id: msg.id, snapshot: msg.content })}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                            <div style={{padding: '0.5rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={newPrivateMessage}
                                  onChange={(e) => setNewPrivateMessage(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter' && newPrivateMessage.trim()) {
                                      submitPrivateMessage();
                                    }
                                  }}
                                  placeholder={t.messages.placeholder}
                                  aria-label={t.messages.placeholder}
                                  style={{flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem'}}
                                />
                                <button
                                  onClick={() => { if (newPrivateMessage.trim()) submitPrivateMessage(); }}
                                  className="btn-primary"
                                  style={{padding: '0.5rem 1rem'}}
                                  aria-label={t.messages.send}
                                  disabled={savingContent}
                                >
                                  <Send style={{width: '1rem', height: '1rem'}} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <button onClick={() => { setViewingProfile(null); setNewPrivateMessage(''); }} className="btn-secondary w-full mt-2">
                        {t.social.close}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {errorToast && (
                <div role="alert" style={{
                  position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(360px, calc(100vw - 2rem))',
                  background: 'linear-gradient(135deg, rgba(220,38,38,0.96) 0%, rgba(248,113,113,0.93) 100%)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  boxShadow: '0 12px 40px rgba(220,38,38,0.45)',
                  borderRadius: '0.85rem', padding: '0.85rem 1rem', zIndex: 9999,
                  animation: 'toast-rise 0.35s ease-out'
                }}>
                  <p className="text-white font-bold" style={{fontSize: '0.9rem', margin: 0, textAlign: 'center'}}>⚠️ {errorToast}</p>
                </div>
              )}

              {openMenu && (
                <div
                  data-moderation-menu
                  onClick={e => e.stopPropagation()}
                  style={{position: 'fixed', zIndex: 9997,
                          top: openMenu.top != null ? `${openMenu.top}px` : undefined,
                          bottom: openMenu.bottom != null ? `${openMenu.bottom}px` : undefined,
                          right: `${openMenu.right}px`,
                          background: 'rgba(17,12,30,0.98)', border: '1px solid rgba(167,139,250,0.35)',
                          borderRadius: '0.75rem', padding: '0.25rem', minWidth: '11rem',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.55)'}}>
                  <button
                    onClick={() => {
                      const m = openMenu;
                      setOpenMenu(null);
                      setReportTarget({ author: m.author, type: m.type, id: m.id, snapshot: m.snapshot });
                    }}
                    style={{display: 'block', width: '100%', textAlign: 'left', background: 'none',
                            border: 'none', color: '#e9d5ff', padding: '0.6rem 0.75rem', cursor: 'pointer'}}
                  >{t.moderation.report}</button>
                  <button
                    onClick={() => { const a = openMenu.author; setOpenMenu(null); setBlockTarget(a); }}
                    style={{display: 'block', width: '100%', textAlign: 'left', background: 'none',
                            border: 'none', color: '#fca5a5', padding: '0.6rem 0.75rem', cursor: 'pointer'}}
                  >{t.moderation.block}</button>
                </div>
              )}

              {blockTarget && (
                <div style={{position: 'fixed', inset: 0, zIndex: 9998, display: 'flex',
                             alignItems: 'center', justifyContent: 'center', padding: '1rem',
                             background: 'rgba(0,0,0,0.7)'}}
                     onClick={() => setBlockTarget(null)}>
                  <div className="bg-glass rounded-2xl border-glass p-4"
                       style={{maxWidth: '22rem', width: '100%'}}
                       onClick={e => e.stopPropagation()}>
                    <h3 className="text-white font-bold mb-2">{t.moderation.blockTitle}</h3>
                    <p className="text-primary font-medium mb-1">{blockTarget}</p>
                    <p className="text-secondary text-sm">{t.moderation.blockConfirm}</p>
                    <div className="flex gap-2" style={{marginTop: '1rem'}}>
                      <button
                        style={{padding: '0.6rem 1rem', borderRadius: '0.75rem', flex: 1,
                                border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.12)',
                                color: '#fca5a5', cursor: 'pointer', fontWeight: 600}}
                        onClick={() => { const n = blockTarget; setBlockTarget(null); doBlock(n); }}
                      >{t.moderation.block}</button>
                      <button className="btn-secondary" style={{flex: 1}}
                        onClick={() => setBlockTarget(null)}>{t.moderation.cancel}</button>
                    </div>
                  </div>
                </div>
              )}

              {ritualToDelete && (
                <div style={{position: 'fixed', inset: 0, zIndex: 9998, display: 'flex',
                             alignItems: 'center', justifyContent: 'center', padding: '1rem',
                             background: 'rgba(0,0,0,0.7)'}}
                     onClick={() => setRitualToDelete(null)}>
                  <div className="bg-glass rounded-2xl border-glass p-4"
                       style={{maxWidth: '22rem', width: '100%'}}
                       onClick={e => e.stopPropagation()}>
                    <h3 className="text-white font-bold mb-2">{t.rituals.deleteTitle}</h3>
                    <p className="text-primary font-medium mb-1">{ritualToDelete.name}</p>
                    <p className="text-secondary text-sm">{t.rituals.deleteBody}</p>
                    <div className="flex gap-2" style={{marginTop: '1rem'}}>
                      <button
                        data-test="delete-ritual-confirm"
                        style={{padding: '0.6rem 1rem', borderRadius: '0.75rem', flex: 1,
                                border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.12)',
                                color: '#fca5a5', cursor: 'pointer', fontWeight: 600}}
                        onClick={() => { const r = ritualToDelete; setRitualToDelete(null); doDeleteRitual(r.id); }}
                      >{t.rituals.deleteYes}</button>
                      <button className="btn-secondary" style={{flex: 1}}
                        data-test="delete-ritual-cancel"
                        onClick={() => setRitualToDelete(null)}>{t.rituals.deleteNo}</button>
                    </div>
                  </div>
                </div>
              )}

              {ritualToStop && (
                <div style={{position: 'fixed', inset: 0, zIndex: 9998, display: 'flex',
                             alignItems: 'center', justifyContent: 'center', padding: '1rem',
                             background: 'rgba(0,0,0,0.7)'}}
                     onClick={() => setRitualToStop(null)}>
                  <div className="bg-glass rounded-2xl border-glass p-4"
                       style={{maxWidth: '22rem', width: '100%'}}
                       onClick={e => e.stopPropagation()}>
                    <h3 className="text-white font-bold mb-2">{t.rituals.stopTitle}</h3>
                    <p className="text-primary font-medium mb-1">{ritualToStop.name}</p>
                    <p className="text-secondary text-sm">{t.rituals.stopBody}</p>
                    <div className="flex gap-2" style={{marginTop: '1rem'}}>
                      <button
                        data-test="stop-ritual-confirm"
                        style={{padding: '0.6rem 1rem', borderRadius: '0.75rem', flex: 1,
                                border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.12)',
                                color: '#fca5a5', cursor: 'pointer', fontWeight: 600}}
                        onClick={() => { doFermaRituale(ritualToStop.id); setRitualToStop(null); }}
                      >{t.rituals.stopYes}</button>
                      <button className="btn-secondary" style={{flex: 1}}
                        data-test="stop-ritual-cancel"
                        onClick={() => setRitualToStop(null)}>{t.rituals.stopNo}</button>
                    </div>
                  </div>
                </div>
              )}

              {reportTarget && (
                <div style={{position: 'fixed', inset: 0, zIndex: 9998, display: 'flex',
                             alignItems: 'center', justifyContent: 'center', padding: '1rem',
                             background: 'rgba(0,0,0,0.7)'}}
                     onClick={() => setReportTarget(null)}>
                  <div className="bg-glass rounded-2xl border-glass p-4"
                       style={{maxWidth: '26rem', width: '100%', maxHeight: '90vh', overflowY: 'auto'}}
                       onClick={e => e.stopPropagation()}>
                    <h3 className="text-white font-bold mb-2">{t.moderation.reportTitle}</h3>
                    <p className="text-primary font-medium" style={{marginBottom: '0.25rem'}}>{reportTarget.author}</p>
                    {reportTarget.snapshot && (
                      <p className="text-secondary text-xs"
                         style={{marginBottom: '0.75rem', fontStyle: 'italic',
                                 overflow: 'hidden', display: '-webkit-box',
                                 WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'}}>
                        «{String(reportTarget.snapshot).slice(0, 160)}»
                      </p>
                    )}
                    <p className="text-secondary text-xs mb-2">{t.moderation.reportWhy}</p>
                    {['spam','harassment','hate','sexual','violence','self_harm','other'].map(k => (
                      <label key={k} style={{display: 'flex', alignItems: 'center', gap: '0.5rem',
                                             color: '#e9d5ff', padding: '0.35rem 0', cursor: 'pointer'}}>
                        <input type="radio" name="report-reason" value={k}
                               checked={reportReason === k}
                               onChange={() => setReportReason(k)} />
                        {t.moderation.reasons[k]}
                      </label>
                    ))}
                    <textarea
                      value={reportNotes}
                      onChange={e => setReportNotes(e.target.value)}
                      placeholder={t.moderation.reportNotes}
                      aria-label={t.moderation.reportNotes}
                      maxLength={1000}
                      style={{width: '100%', marginTop: '0.75rem', minHeight: '4.5rem',
                              background: 'rgba(255,255,255,0.06)', color: '#fff',
                              border: '1px solid rgba(167,139,250,0.3)', borderRadius: '0.6rem',
                              padding: '0.5rem'}}
                    />
                    <div className="flex gap-2" style={{marginTop: '0.75rem'}}>
                      <button className="btn-primary" onClick={doReport}>{t.moderation.reportSend}</button>
                      <button className="btn-secondary" onClick={() => setReportTarget(null)}>{t.moderation.cancel}</button>
                    </div>
                    <a href={`regole.html#${lang}`} target="_blank" rel="noopener"
                       className="text-secondary text-xs"
                       style={{display: 'inline-block', marginTop: '0.75rem'}}>{t.moderation.reportRules}</a>
                  </div>
                </div>
              )}

              {avvisoInviti && (
                <div data-test="avviso-inviti" role="status" style={{
                  position: 'fixed', bottom: '4.5rem', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(360px, calc(100vw - 2rem))', background: 'rgba(30,27,75,0.96)',
                  border: '1px solid rgba(167,139,250,0.5)', borderRadius: '0.85rem', padding: '0.85rem 1rem', zIndex: 9999
                }}>
                  <p className="text-white" style={{fontSize: '0.9rem', margin: 0, textAlign: 'center'}}>{avvisoInviti}</p>
                </div>
              )}

              {/* La scheda ha zIndex 9999 e la conferma del blocco 10000: la conferma si apre sopra. */}
              {schedaInvito && (
                <div data-test="scheda-invito" role="dialog" style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'}}>
                  <div className="bg-glass-dark rounded-2xl" style={{maxWidth: '22rem', width: '100%', padding: '1.25rem'}}>
                    <h3 className="text-white font-bold">{schedaInvito.dati.nickname}</h3>
                    {schedaInvito.dati.country && <p className="text-secondary text-sm">{schedaInvito.dati.country}</p>}
                    {schedaInvito.dati.bio && <p className="text-white text-sm" style={{margin: '0.5rem 0'}}>{schedaInvito.dati.bio}</p>}
                    {schedaInvito.dati.prove != null && (
                      <p className="text-secondary text-sm">
                        {testoInviti('prove')}: {schedaInvito.dati.prove}
                        {IH && IH.percentuale(schedaInvito.dati.prove, schedaInvito.dati.indovinate) ? ` · ${testoInviti('indovinate')}: ${IH.percentuale(schedaInvito.dati.prove, schedaInvito.dati.indovinate)}` : ''}
                      </p>
                    )}
                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem'}}>
                      {!invitoInUscita && !directInviteTarget && !schedaInvito.chi.busy && (
                        <button data-test="btn-invita" className="btn-primary"
                          onClick={() => { const chi = schedaInvito.chi; setSchedaInvito(null); sendDirectInvite(chi); }}>{testoInviti('invita')}</button>
                      )}
                      <button data-test="btn-blocca-scheda" className="btn-secondary"
                        onClick={() => setConfermaBlocco({ nome: schedaInvito.dati.nickname, ...(schedaInvito.chi.disponibilita_id
                          ? { p_disponibilita_id: schedaInvito.chi.disponibilita_id } : { p_session_online: schedaInvito.chi.id }) })}>
                        {testoInviti('blocca')}
                      </button>
                      <button data-test="btn-chiudi-scheda" className="btn-secondary" onClick={() => setSchedaInvito(null)}>{testoInviti('chiudi')}</button>
                    </div>
                  </div>
                </div>
              )}

              {confermaBlocco && (
                <div data-test="conferma-blocco" role="dialog" style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'}}>
                  <div className="bg-glass-dark rounded-2xl" style={{maxWidth: '22rem', width: '100%', padding: '1.25rem'}}>
                    <p className="text-white" style={{marginBottom: '1rem'}}>{testoInviti('conferma_blocco', { nome: confermaBlocco.nome })}</p>
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      <button data-test="btn-conferma-blocco" className="btn-primary" style={{flex: 1}} onClick={confermaBloccoInviti}>{testoInviti('conferma')}</button>
                      <button data-test="btn-annulla-blocco" className="btn-secondary" style={{flex: 1}} onClick={() => setConfermaBlocco(null)}>{testoInviti('annulla')}</button>
                    </div>
                  </div>
                </div>
              )}

              {infoToast && (
                <div role="status" style={{
                  position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(360px, calc(100vw - 2rem))',
                  background: 'linear-gradient(135deg, rgba(109,40,217,0.96) 0%, rgba(167,139,250,0.93) 100%)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  boxShadow: '0 12px 40px rgba(109,40,217,0.45)',
                  borderRadius: '0.85rem', padding: '0.85rem 1rem', zIndex: 9999,
                  animation: 'toast-rise 0.35s ease-out'
                }}>
                  <p className="text-white font-bold" style={{fontSize: '0.9rem', margin: 0, textAlign: 'center'}}>✅ {infoToast}</p>
                </div>
              )}

              {incomingInvite && (!partner || sessionEnded) && (
                <div
                  className="invite-toast"
                  style={{
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
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.6rem'}}>
                    <span style={{fontSize: '1.6rem'}}>🧠</span>
                    <div style={{flex: 1, minWidth: 0}}>
                      <p className="text-white font-bold" style={{fontSize: '0.95rem', margin: 0, lineHeight: 1.2}}>
                        ✨ <strong>{incomingInvite.from_name}</strong>
                      </p>
                      <p className="text-white" style={{fontSize: '0.78rem', margin: 0, opacity: 0.9, lineHeight: 1.3}}>
                        {t.telepathy.inviteModalBody}
                      </p>
                    </div>
                  </div>
                  <div style={{display: 'flex', gap: '0.5rem'}}>
                    <button data-test="btn-accetta" onClick={acceptInvite} className="btn-primary" style={{flex: 1, fontSize: '0.85rem', padding: '0.4rem 0.6rem'}}>{t.telepathy.acceptBtn}</button>
                    <button data-test="btn-rifiuta" onClick={declineInvite} className="btn-secondary" style={{flex: 1, fontSize: '0.85rem', padding: '0.4rem 0.6rem'}}>{t.telepathy.declineBtn}</button>
                  </div>
                  <button data-test="btn-blocca-da-invito"
                    onClick={() => setConfermaBlocco({ nome: incomingInvite.from_name, p_invite_id: incomingInvite.invite_id })}
                    className="text-white text-xs" style={{marginTop: '0.5rem', opacity: 0.85, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0}}>
                    {testoInviti('blocca')}
                  </button>
                </div>
              )}
              {/* Un invito durante un training (es. notifica toccata mentre si gioca): il training
                  continua e si può solo rifiutare. Classe diversa da invite-toast di proposito:
                  i test contano .invite-toast per il banner con «Accetta». */}
              {incomingInvite && partner && !sessionEnded && !partnerDisconnected && (
                <div data-test="invito-durante-training" className="invite-toast-training" style={{
                  position: 'fixed', top: '1rem', right: '1rem', width: 'min(320px, calc(100vw - 2rem))',
                  background: 'rgba(30,27,75,0.95)', border: '1px solid rgba(167,139,250,0.5)', borderRadius: '0.85rem',
                  padding: '0.75rem 1rem', zIndex: 9999
                }}>
                  <p className="text-white" style={{fontSize: '0.85rem', margin: '0 0 0.5rem 0'}}>
                    {testoInviti('invito_durante_training', { nome: incomingInvite.from_name })}
                  </p>
                  <button data-test="btn-rifiuta" onClick={declineInvite} className="btn-secondary" style={{fontSize: '0.8rem', padding: '0.3rem 0.75rem'}}>
                    {testoInviti('rifiuta')}
                  </button>
                </div>
              )}
              {attesaInvitante && partner && !sessionEnded && (
                <div data-test="attesa-invitante" role="status" style={{
                  position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(360px, calc(100vw - 2rem))', background: 'rgba(30,27,75,0.95)',
                  border: '1px solid rgba(167,139,250,0.5)', borderRadius: '0.85rem', padding: '0.75rem 1rem', zIndex: 9998, textAlign: 'center'
                }}>
                  <p className="text-white" style={{fontSize: '0.9rem', margin: 0}}>
                    {testoInviti('attesa_invitante', { nome: attesaInvitante.nome, tempo: IH && !isNaN(Date.parse(attesaInvitante.respondedAt)) ? IH.mmss(
                      // una data storta non deve far cadere il render (toISOString lancia su NaN)
                      IH.secondiRimasti(new Date(Date.parse(attesaInvitante.respondedAt) + 180000).toISOString(), scartoOrologio, adessoLocale)) : '' })}
                  </p>
                </div>
              )}

              {partner && !sessionEnded && !partnerDisconnected && isTabHidden && (
                <div
                  className="training-floating-banner"
                  onClick={() => setActiveTab('telepathy')}
                  style={{
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
                  }}
                  title={t.telepathy.trainingFloatingCta}
                >
                  <p className="text-white" style={{margin: 0, fontSize: '0.9rem', lineHeight: 1.35}}>
                    🔮 {t.telepathy.trainingFloatingPrefix} <strong>{partner.nickname}</strong> — {t.telepathy.trainingFloatingCta}
                  </p>
                </div>
              )}

              {roleSwapOverlay && (
                <div className="role-swap-overlay" onClick={() => setRoleSwapOverlay(null)}>
                  <div className="role-swap-card">
                    <p className="role-swap-text">{roleSwapOverlay === 'sender' ? t.telepathy.roleSwappedSender : t.telepathy.roleSwappedReceiver}</p>
                  </div>
                </div>
              )}

              {showEndSessionConfirm && (
                <div className="modal-overlay" onClick={() => setShowEndSessionConfirm(false)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '400px'}}>
                    <h3 className="text-white font-bold mb-2" style={{fontSize: '1.1rem'}}>
                      {t.telepathy.endSessionConfirmTitle}
                    </h3>
                    <p className="text-secondary mb-4" style={{fontSize: '0.9rem'}}>
                      {t.telepathy.endSessionConfirmBody}
                    </p>
                    <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
                      <button onClick={() => setShowEndSessionConfirm(false)} className="btn-secondary">
                        {t.telepathy.endSessionConfirmNo}
                      </button>
                      <button
                        onClick={() => { setShowEndSessionConfirm(false); endSession(); }}
                        className="btn-primary"
                      >
                        {t.telepathy.endSessionConfirmYes}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showLogoutConfirm && (
                <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '400px'}}>
                    <h3 className="text-white font-bold mb-2" style={{fontSize: '1.1rem'}}>
                      {t.logoutConfirmTitle}
                    </h3>
                    <p className="text-secondary mb-4" style={{fontSize: '0.9rem'}}>
                      {t.logoutConfirmBody}
                    </p>
                    <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
                      <button onClick={() => setShowLogoutConfirm(false)} className="btn-secondary">
                        {t.logoutConfirmNo}
                      </button>
                      <button
                        onClick={() => { setShowLogoutConfirm(false); handleLogout(); }}
                        className="btn-primary"
                      >
                        {t.logoutConfirmYes}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {renderIosInstallModal()}

              {showDeleteAccount && (
                <div className="modal-overlay" onClick={() => !gdprBusy && setShowDeleteAccount(false)} style={{zIndex: 60}}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '26rem'}}>
                    <h3 className="text-xl font-bold text-white mb-2">{t.gdprDeleteTitle}</h3>
                    <p className="text-secondary text-sm mb-4">{t.gdprDeleteBody}</p>
                    <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.gdprDeleteConfirmLabel}</label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={nickname}
                      style={{marginBottom: '1rem'}}
                    />
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      <button className="btn-secondary" style={{flex: 1}} disabled={gdprBusy} onClick={() => setShowDeleteAccount(false)}>
                        {t.gdprDeleteCancel}
                      </button>
                      <button
                        style={{flex: 1, padding: '0.6rem', borderRadius: '0.75rem', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: (deleteConfirmText === nickname && !gdprBusy) ? 'pointer' : 'not-allowed', opacity: (deleteConfirmText === nickname && !gdprBusy) ? 1 : 0.5}}
                        disabled={deleteConfirmText !== nickname || gdprBusy}
                        onClick={confirmDeleteAccount}
                      >
                        {gdprBusy ? t.gdprDeleting : t.gdprDeleteConfirmBtn}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showCreateRitual && (
                <div className="modal-overlay" onClick={() => setShowCreateRitual(false)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <h2 className="text-2xl font-bold text-white mb-6">{t.rituals.modalTitle}</h2>
                    
                    <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.ritualName}</label>
                        <input
                          type="text"
                          value={newRitual.name}
                          onChange={(e) => setNewRitual({...newRitual, name: e.target.value})}
                          placeholder={t.rituals.namePh}
                          maxLength={80}
                        />
                      </div>

                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.description}</label>
                        <textarea
                          value={newRitual.description}
                          onChange={(e) => setNewRitual({...newRitual, description: e.target.value})}
                          placeholder={t.rituals.descPh}
                          rows="5"
                          maxLength={5000}
                        />
                        {5000 - newRitual.description.length < 500 && (
                          <div className="text-xs text-secondary">{t.rituals.descCounter(5000 - newRitual.description.length)}</div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.type}</label>
                          <select value={newRitual.type} onChange={(e) => setNewRitual({...newRitual, type: e.target.value})}>
                            {ritualTypes.map(type => (
                              <option key={type.id} value={type.id}>{type.icon} {t.rituals.types[type.id]}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.sacredNumber}</label>
                          <select value={newRitual.sacredNumber} onChange={(e) => setNewRitual({...newRitual, sacredNumber: parseInt(e.target.value)})}>
                            {sacredNumbers.map(num => (
                              <option key={num} value={num}>{num}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.date}</label>
                          <input
                            type="date"
                            value={newRitual.date}
                            onChange={(e) => setNewRitual({...newRitual, date: e.target.value})}
                          />
                        </div>

                        <div>
                          <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.time}</label>
                          <input
                            type="time"
                            value={newRitual.time}
                            onChange={(e) => setNewRitual({...newRitual, time: e.target.value})}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.duration}</label>
                        <input
                          type="number"
                          value={newRitual.duration}
                          onChange={(e) => setNewRitual({...newRitual, duration: parseInt(e.target.value)})}
                          // min era 5: con il predefinito a 3 il campo avrebbe rifiutato il
                          // proprio valore iniziale. Il server accetta da 1 minuto in su.
                          min="1"
                          max={newRitual.ripeti === 'mai' ? 180 : 720}
                        />
                      </div>

                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.repeat}</label>
                        <select
                          data-test="repeat-select"
                          value={newRitual.ripeti}
                          onChange={(e) => setNewRitual({...newRitual, ripeti: e.target.value})}
                        >
                          <option value="mai">{t.rituals.repeatNever}</option>
                          <option value="ogni">{t.rituals.repeatDaily}</option>
                          <option value="giorni">{t.rituals.repeatDays}</option>
                        </select>
                        {newRitual.ripeti === 'giorni' && (
                          <div className="flex gap-1" style={{marginTop: '0.5rem', flexWrap: 'wrap'}}>
                            {[1, 2, 3, 4, 5, 6, 7].map(n => {
                              const attivo = (newRitual.giorni || []).includes(n);
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  data-test={`repeat-day-${n}`}
                                  aria-pressed={attivo}
                                  onClick={() => setNewRitual({...newRitual, giorni: attivo
                                    ? newRitual.giorni.filter(g => g !== n)
                                    : [...(newRitual.giorni || []), n].sort((a, b) => a - b)})}
                                  className={attivo ? 'btn-primary' : 'btn-secondary'}
                                  style={{padding: '0.4rem 0.6rem', fontSize: '0.8rem', minHeight: '40px'}}
                                >{t.rituals.weekdaysShort[n - 1]}</button>
                              );
                            })}
                          </div>
                        )}
                        {newRitual.ripeti !== 'mai' && (
                          <div style={{marginTop: '0.5rem'}}>
                            <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.until}</label>
                            <input
                              type="date"
                              data-test="repeat-until"
                              value={newRitual.fino || ''}
                              min={newRitual.date}
                              onChange={(e) => setNewRitual({...newRitual, fino: e.target.value})}
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <button onClick={() => setShowCreateRitual(false)} className="btn-secondary w-full">
                          {t.rituals.cancel}
                        </button>
                        <button onClick={createRitual} className="btn-primary w-full" disabled={savingContent}>
                          {savingContent ? '…' : t.rituals.create}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* preload="none": il brano pesa, non lo scarica chi non entra mai in una sessione */}
              <audio ref={musicRef} src={MUSIC_SRC} loop preload="none" />
              {/* La stanza del rituale: la preghiera in grande e quante persone ci sono adesso.
                  zIndex 9990: sotto la soglia (10000), che quando serve il tocco per la musica
                  deve restare sopra, e sotto gli avvisi (9997-9999), che altrimenti la stanza
                  coprirebbe — un errore sulla candela non si vedrebbe. */}
              {stanza && stanzaLive && (
                <div data-test="ritual-room" role="dialog" aria-label={t.rituals.room}
                  style={{position: 'fixed', inset: 0, zIndex: 9990, display: 'flex', flexDirection: 'column',
                          alignItems: 'center', padding: '2rem 1.25rem', gap: '1rem', overflowY: 'auto',
                          background: 'rgba(10, 6, 30, 0.94)', backdropFilter: 'blur(6px)'}}>
                  <button data-test="room-close" onClick={() => setStanzaId(null)} className="btn-secondary"
                    style={{alignSelf: 'flex-end'}}>{t.rituals.closeRoom}</button>
                  <div style={{fontSize: '3rem'}}>{ritualTypes.find(x => x.id === stanza.type)?.icon}</div>
                  <h2 className="text-white" style={{fontSize: '1.6rem', fontWeight: 700, textAlign: 'center'}}>{stanza.name}</h2>
                  <div data-test="room-people" style={{color: '#4ade80'}}>
                    {presentiStanza != null ? t.rituals.peopleHere(presentiStanza) : ''}
                  </div>
                  {stanza.description && (
                    <div data-test="room-text" className="text-white"
                      style={{whiteSpace: 'pre-wrap', fontSize: '1.35rem', lineHeight: 1.6, maxWidth: '40rem', textAlign: 'center'}}>
                      {stanza.description}
                    </div>
                  )}
                  <div style={{display: 'flex', gap: '0.75rem'}}>
                    <button data-test="room-candle" onClick={() => toggleCandle(stanza.id)} className="btn-secondary px-4"
                      aria-pressed={candelaMiaStanza}
                      aria-label={candelaMiaStanza ? t.rituals.candleExtinguish : t.rituals.candleLight}
                      title={candelaMiaStanza ? t.rituals.candleExtinguish : t.rituals.candleLight}
                      style={candelaMiaStanza ? {border: '1px solid rgba(251,191,36,0.7)', background: 'rgba(251,191,36,0.18)'} : undefined}>
                      🕯️ {(stanza.candles || []).length}
                    </button>
                    {/* Il 🔊 dell'intestazione resta sotto la stanza a tutto schermo: senza questo
                        pulsante, per silenziare la musica bisognerebbe uscire dalla stanza.
                        Stessa guardia del pulsante in alto: il click nato dal tocco che ha
                        appena sbloccato la musica non deve spegnerla. */}
                    <button data-test="room-music"
                      onClick={() => {
                        if (Date.now() - sbloccoMusicaRef.current < 1000) return;
                        toggleMusic();
                      }}
                      className="btn-secondary px-4"
                      title={musicaInAttesaDiGesto ? t.musicTap : undefined}
                      aria-label={musicaInAttesaDiGesto ? t.musicTap : (musicMuted ? t.musicUnmute : t.musicMute)}>
                      {musicMuted ? '🔇' : (musicaInAttesaDiGesto ? '🔈' : '🔊')}
                    </button>
                  </div>
                  {/* Chi ha acceso una candela in questo appuntamento (la vista azzera i nomi di
                      quelli passati). I bloccati non si mostrano, come altrove nell'app. */}
                  {nomiCandeleStanza.length > 0 && (
                    <div data-test="room-candle-names" style={{color: 'rgba(251,191,36,0.9)', textAlign: 'center', maxWidth: '40rem'}}>
                      {t.rituals.candlesLitBy}: {nomiCandeleStanza.join(', ')}
                    </div>
                  )}
                </div>
              )}
              {sogliaAperta && ritualeLive && (
                <div
                  data-test="soglia-rituale"
                  role="button"
                  tabIndex={0}
                  aria-label={t.rituals.thresholdTap}
                  // Chiudere al primo click prometterebbe una musica che forse non e' ancora
                  // partita: la soglia se ne va da sola quando l'audio si sblocca. Un secondo
                  // tocco la chiude comunque — non deve mai poter imprigionare l'app.
                  onClick={() => {
                    if (!musicaInAttesaDiGesto || tocchiSogliaRef.current++ >= 1) setSogliaAperta(false);
                  }}
                  style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: '1rem', padding: '2rem', textAlign: 'center', cursor: 'pointer',
                    background: 'rgba(10, 6, 30, 0.88)', backdropFilter: 'blur(6px)',
                    animation: 'rso-fade 0.4s ease-out'
                  }}
                >
                  <div style={{fontSize: '3.5rem', animation: 'pulse-glow 2.5s ease-in-out infinite', borderRadius: '50%'}}>✨</div>
                  <div className="text-white" style={{fontSize: '1.5rem', fontWeight: 600}}>{ritualeLive.name}</div>
                  <div style={{color: '#c4b5fd', fontSize: '1.15rem'}}>{t.rituals.thresholdTap}</div>
                  <div style={{color: '#a78bfa', fontSize: '0.85rem', opacity: 0.8}}>{t.rituals.thresholdHint}</div>
                </div>
              )}
              {renderFooter()}
              {renderPrivacyModal()}
            </div>
          );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(GlobalAwakeningPlatform));
    