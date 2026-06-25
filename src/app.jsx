
        const { useState, useEffect, useRef } = React;

        // Supabase is initialized in the script tag above

        // Hash legacy (SHA-256 semplice). Mantenuto SOLO per verificare account vecchi
        // e migrarli a PBKDF2 al primo login (vedi verifyPassword / handleLogin). Non usarlo
        // più per memorizzare nuove password: usare deriveStrongHash.
        async function hashPassword(password) {
          const encoder = new TextEncoder();
          const data = encoder.encode(password);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // C1: hash robusto PBKDF2-SHA256 con salt (16 byte) e 100k iterazioni.
        // Formato autodescrittivo: "pbkdf2$<iter>$<saltB64>$<hashB64>".
        // Per un nuovo hash: salt random. Per verifica: passare salt+iter dell'hash memorizzato
        // (ricostruisce la stessa stringa se la password combacia).
        async function deriveStrongHash(password, saltBytes, iterations) {
          const enc = new TextEncoder();
          const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
          const iter = iterations || 100000;
          const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
          const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, keyMaterial, 256);
          const b64 = (arr) => btoa(String.fromCharCode.apply(null, new Uint8Array(arr)));
          return `pbkdf2$${iter}$${b64(salt)}$${b64(bits)}`;
        }

        // Verifica password contro l'hash memorizzato. Dual-path:
        //  - "pbkdf2$..." → ricalcola con lo stesso salt/iter e confronta.
        //  - altrimenti (SHA-256 hex legacy) → confronta con hashPassword, ok ma legacy=true
        //    (il chiamante deve ri-hashare a PBKDF2 = migrazione).
        async function verifyPassword(password, stored) {
          if (!stored) return { ok: false };
          if (stored.indexOf('pbkdf2$') === 0) {
            const parts = stored.split('$'); // ['pbkdf2', iter, saltB64, hashB64]
            const iter = parseInt(parts[1], 10);
            const salt = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
            const candidate = await deriveStrongHash(password, salt, iter);
            return { ok: candidate === stored };
          }
          const legacy = await hashPassword(password);
          return { ok: legacy === stored, legacy: true };
        }

        // Validazione formato email lato client (A8): blocca submit con email malformate.
        function isValidEmail(email) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }

        const Star = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>;
        const Brain = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"></path></svg>;
        const Send = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>;
        const Calendar = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
        const Users = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;

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
            wrongPassword: "Wrong password",
            emailNotFound: "No account found with this email",
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
            setPassword: "Set Password",
            changePassword: "Change Password",
            passwordSet: "Password set!",
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
            resetEmailSent: "Email sent! Check your inbox and click the link.",
            resetTokenInvalid: "Link invalid or expired. Please request a new one.",
            resetSuccess: "Password updated! You can now log in.",
            setNewPassword: "Set new password",
            magicLinkSent: "Email sent! Click the link to log in.",
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
            tabs: { rituals: "Rituals", telepathy: "Telepathy", consciousness: "Consciousness" },
            showTelepathyScore: "Show telepathy score",
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
              subtitle: "Synchronized awakening ceremonies",
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
              modalTitle: "Create Ritual",
              ritualName: "Ritual Name",
              description: "Description",
              type: "Type",
              sacredNumber: "Sacred Number",
              date: "Date",
              time: "Time (UTC)",
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
            wrongPassword: "Password errata",
            emailNotFound: "Nessun account trovato con questa email",
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
            setPassword: "Imposta Password",
            changePassword: "Cambia Password",
            passwordSet: "Password impostata!",
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
            resetEmailSent: "Email inviata! Controlla la tua casella e clicca il link.",
            resetTokenInvalid: "Link non valido o scaduto. Richiedine uno nuovo.",
            resetSuccess: "Password aggiornata! Puoi ora accedere.",
            setNewPassword: "Imposta nuova password",
            magicLinkSent: "Email inviata! Clicca il link per accedere.",
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
            tabs: { rituals: "Rituali", telepathy: "Telepatia", consciousness: "Coscienza" },
            showTelepathyScore: "Mostra punteggio telepatia",
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
              subtitle: "Cerimonie di risveglio sincronizzate",
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
              modalTitle: "Crea Rituale",
              ritualName: "Nome Rituale",
              description: "Descrizione",
              type: "Tipo",
              sacredNumber: "Numero Sacro",
              date: "Data",
              time: "Ora (UTC)",
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
              bestScore: "% Match",
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
            }
          }
        };

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
          // Tiene traccia dell'ultimo round_count processato per evitare doppio processing
          const lastProcessedRoundRef = React.useRef(-1);
          const [isMatch, setIsMatch] = useState(false);
          const [matchId, setMatchId] = useState(null);
          const [matchUser1Id, setMatchUser1Id] = useState(null); // user1 del match = primo chooser (cambio-modalità a turni)
          const [leaderboard, setLeaderboard] = useState([]); // top 10 per match telepatici
          const [partnerSymbol, setPartnerSymbol] = useState(null);

          // Telepatia v2 — nuovi state
          const [incomingInvite, setIncomingInvite] = useState(null); // { from_id, from_name, invite_id }
          const [directInviteTarget, setDirectInviteTarget] = useState(null); // utente a cui abbiamo inviato invito
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
          const isStandalone = (typeof window !== 'undefined') &&
            (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
          const isIos = (typeof navigator !== 'undefined') && /iphone|ipad|ipod/i.test(navigator.userAgent);
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

          // Classifica telepatia: top 10 per match telepatici totali (lettura sola da telepathy_scores).
          const loadLeaderboard = async () => {
            const { data } = await supabase.from('telepathy_scores').select('*').order('matches_count', { ascending: false }).limit(10);
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
            duration: 30
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
          const [magicLinkEmail, setMagicLinkEmail] = useState('');
          const [showMagicLink, setShowMagicLink] = useState(false);
          const t = translations[lang];
          // Etichetta leggibile del livello (pannello sessione + chooser). Per la scala
          // mostra "N Simboli" (es. "3 Simboli"); Numeri/Lettere usano le label dedicate.
          const levelLabel = (level) => {
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

          // Pulizia stato remoto alla chiusura del tab.
          // sendBeacon non supporta DELETE: usiamo fetch con keepalive=true che il browser
          // garantisce di completare anche dopo unload.
          const matchIdRef = React.useRef(null);
          const sessionIdRef = React.useRef(null);
          React.useEffect(() => { matchIdRef.current = matchId; }, [matchId]);
          React.useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
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
                  fetch(`${SUPABASE_URL}/rest/v1/telepathy_invites?from_id=eq.${sid}`, opts);
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

                  // Arricchisci utenti con stato 'in sessione' o 'disponibile'
                  const { data: activeMatches } = await supabase.from('telepathy_matches').select('user1_id,user2_id');
                  const busyIds = new Set();
                  if (activeMatches) {
                    activeMatches.forEach(m => {
                      busyIds.add(m.user1_id);
                      busyIds.add(m.user2_id);
                    });
                  }
                  const usersWithStatus = uniqueUsers.map(u => ({
                    ...u,
                    status: busyIds.has(u.id) ? 'busy' : 'available'
                  }));
                  setOnlineUsersForTelepathy(usersWithStatus.filter(u => u.nickname !== nickname));

                  // Controlla inviti in arrivo
                  const { data: invites } = await supabase.from('telepathy_invites')
                    .select('*').eq('to_id', sessionId).eq('status', 'pending');
                  if (invites && invites.length > 0) {
                    const inv = invites[0];
                    setIncomingInvite({ from_id: inv.from_id, from_name: inv.from_name, invite_id: inv.id });
                  } else {
                    setIncomingInvite(null);
                  }

                  // Pulizia inviti vecchi (> 2 minuti)
                  await supabase.from('telepathy_invites').delete()
                    .eq('to_id', sessionId)
                    .lt('created_at', new Date(Date.now() - 120000).toISOString());
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
              const { data: ritualsData } = await supabase.from('rituals').select('*').order('created_at', { ascending: false });
              if (ritualsData) {
                const now = new Date();
                const expired = ritualsData.filter(r => {
                  const endTime = new Date(new Date(`${r.date}T${r.time}Z`).getTime() + r.duration * 60000);
                  return now > endTime;
                });
                if (expired.length > 0) {
                  await supabase.rpc('cleanup_expired_rituals');
                }
                setRituals(ritualsData.filter(r => !expired.find(e => e.id === r.id)));
              }

              const { data: postsData } = await supabase.from('consciousness_posts').select('*').order('created_at', { ascending: false }).limit(50);
              if (postsData) setPosts(postsData);

              if (expandedPostIdRef.current) {
                const { data: commentsData } = await supabase.from('consciousness_comments').select('*').eq('post_id', expandedPostIdRef.current).order('created_at', { ascending: true });
                if (commentsData) setCommentsMap(prev => ({ ...prev, [expandedPostIdRef.current]: commentsData }));
              }
              if (expandedRitualIdRef.current) {
                const { data: rCommentsData } = await supabase.from('ritual_comments').select('*').eq('ritual_id', expandedRitualIdRef.current).order('created_at', { ascending: true });
                if (rCommentsData) setRitualCommentsMap(prev => ({ ...prev, [expandedRitualIdRef.current]: rCommentsData }));
              }
            };
            
            loadData();
            const interval = setInterval(loadData, 10000);
            
            // Subscribe to real-time updates
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
              await supabase.from('telepathy_matches').delete().lt('created_at', new Date(Date.now() - 300000).toISOString());

              // 1. Check if someone already matched with me
              const { data: matches } = await supabase.from('telepathy_matches').select('*');
              if (matches) {
                const myMatch = matches.find(m => m.user1_id === sessionId || m.user2_id === sessionId);
                if (myMatch) {
                  const amUser1 = myMatch.user1_id === sessionId;
                  setPartner({ id: amUser1 ? myMatch.user2_id : myMatch.user1_id, nickname: amUser1 ? myMatch.user2_nickname : myMatch.user1_nickname });
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

              if (queue && queue.length > 0) {
                const available = queue[0];

                // Re-check pre-insert: tra il primo SELECT (riga sopra) e l'INSERT, un altro
                // client puo' avermi appena matchato o aver matchato 'available' con un terzo.
                // NB: lato DB serve anche un UNIQUE constraint su (LEAST(u1,u2),GREATEST(u1,u2))
                // per chiudere completamente la race. Questo client-side dedup la mitiga.
                const { data: precheck } = await supabase.from('telepathy_matches').select('*');
                const existingForMe = (precheck || []).find(m => m.user1_id === sessionId || m.user2_id === sessionId);
                if (existingForMe) {
                  const amUser1 = existingForMe.user1_id === sessionId;
                  setPartner({ id: amUser1 ? existingForMe.user2_id : existingForMe.user1_id, nickname: amUser1 ? existingForMe.user2_nickname : existingForMe.user1_nickname });
                  setRole(amUser1 ? existingForMe.user1_role : existingForMe.user2_role);
                  setMatchId(existingForMe.id);
                  setSearchingPartner(false);
                  await supabase.from('telepathy_queue').delete().eq('id', sessionId);
                  return;
                }
                const existingForThem = (precheck || []).find(m => m.user1_id === available.id || m.user2_id === available.id);
                if (existingForThem) {
                  // available e' stato matchato con qualcun altro: prossimo tick rifara' lookup
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
                  // INSERT fallita (probabile race con unique constraint o errore HTTP): retry next tick
                  return;
                }

                // Post-insert dedup: se entrambi i client hanno fatto INSERT in parallelo, il match
                // piu' vecchio (per created_at) vince. Cancello eventuali duplicati per la stessa coppia.
                const { data: postcheck } = await supabase.from('telepathy_matches').select('*');
                const pairMatches = (postcheck || []).filter(m =>
                  (m.user1_id === sessionId && m.user2_id === available.id) ||
                  (m.user2_id === sessionId && m.user1_id === available.id)
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
          // guest orfana.
          const mergeGuestTelepathyData = async (oldSid, newUserId, currentNickname) => {
            if (!oldSid || !newUserId || oldSid === newUserId) return null;
            const { data, error } = await supabase.rpc('merge_telepathy_scores', {
              p_old_user_id: oldSid,
              p_new_user_id: newUserId,
              p_nickname: currentNickname || 'Anonymous'
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

            // Search profile by email
            setAuthLoading(true);
            const { data, error } = await supabase.from('profiles').select('*').eq('email', email);
            if (error) {
              setLoginError(t.connectionError);
              setAuthLoading(false);
              return;
            }
            if (!data || data.length === 0) {
              setLoginError(t.emailNotFound);
              setAuthLoading(false);
              return;
            }

            const existing = data[0];
            // C1: verifica dual-path (PBKDF2 nuovo schema, fallback SHA-256 legacy).
            let verify;
            try {
              verify = await verifyPassword(pw, existing.password_hash);
            } catch (e) {
              setLoginError(t.connectionError);
              setAuthLoading(false);
              return;
            }
            if (existing.password_hash && !verify.ok) {
              setLoginError(t.wrongPassword);
              setAuthLoading(false);
              return;
            }
            // Hash da tenere lato client (deve combaciare con lo stored: serve a Step B).
            // Se l'account era legacy (SHA-256) e la password combacia → ri-hash PBKDF2 = migrazione.
            let effectiveHash = existing.password_hash;
            if (verify.ok && verify.legacy) {
              try {
                effectiveHash = await deriveStrongHash(pw);
                await supabase.from('profiles').update({ password_hash: effectiveHash }).eq('session_id', existing.session_id);
              } catch (e) {
                effectiveHash = existing.password_hash; // upgrade fallito: non bloccare il login
              }
            }

            // Match — load session_id and profile
            setSessionId(existing.session_id);
            localStorage.setItem('ga_session_id', existing.session_id);
            setPasswordHash(effectiveHash);
            if (effectiveHash) localStorage.setItem('ga_pwhash', effectiveHash);
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
              const merged = await mergeGuestTelepathyData(prevGuestSid, email, existing.nickname || 'Anonymous');
              if (merged) {
                setTotalRounds(merged.rounds_count);
                setTotalMatches(merged.matches_count);
                localStorage.setItem('telepathy_score', String(merged.rounds_count));
                localStorage.setItem('telepathy_best', String(merged.matches_count));
                await supabase.from('profiles').update({
                  telepathy_score: merged.rounds_count,
                  telepathy_best: merged.matches_count
                }).eq('email', email);
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

            // Check if email already exists
            const { data: emailCheck, error: emailErr } = await supabase.from('profiles').select('*').eq('email', email);
            if (emailErr) { setLoginError(t.connectionError); setAuthLoading(false); return; }
            if (emailCheck && emailCheck.length > 0) {
              setLoginError(t.emailAlreadyUsed);
              setAuthLoading(false);
              return;
            }

            // Check if nickname already exists
            const { data: nickCheck, error: nickErr } = await supabase.from('profiles').select('*').eq('nickname', name);
            if (nickErr) { setLoginError(t.connectionError); setAuthLoading(false); return; }
            if (nickCheck && nickCheck.length > 0) {
              setLoginError(t.usernameAlreadyUsed);
              setAuthLoading(false);
              return;
            }

            let hash;
            try {
              hash = await deriveStrongHash(pw);
            } catch (e) {
              setLoginError(t.connectionError);
              setAuthLoading(false);
              return;
            }
            setPasswordHash(hash);
            localStorage.setItem('ga_pwhash', hash);
            const newSid = Date.now() + '-' + Math.random();
            setSessionId(newSid);
            localStorage.setItem('ga_session_id', newSid);

            const { error: insertError } = await supabase.from('profiles').insert({
              session_id: newSid,
              nickname: name,
              email: email,
              password_hash: hash,
              bio: '',
              starseed_type: '',
              avatar: '',
              country: '',
              interests: [],
              experience_level: '',
              telepathy_score: 0,
              telepathy_best: 0,
              show_telepathy_score: true
            });

            if (insertError) {
              setLoginError(t.registrationError || 'Registration failed. Please try again.');
              setAuthLoading(false);
              return;
            }

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
              const merged = await mergeGuestTelepathyData(prevGuestSid, email, name);
              if (merged) {
                setTotalRounds(merged.rounds_count);
                setTotalMatches(merged.matches_count);
                localStorage.setItem('telepathy_score', String(merged.rounds_count));
                localStorage.setItem('telepathy_best', String(merged.matches_count));
                await supabase.from('profiles').update({
                  telepathy_score: merged.rounds_count,
                  telepathy_best: merged.matches_count
                }).eq('email', email);
              }
            }
            setAuthLoading(false);
          };

          const handleSendResetEmail = async () => {
            const email = resetEmail.trim().toLowerCase();
            if (!email) { setLoginError(t.fillAllFields); return; }
            if (!isValidEmail(email)) { setLoginError(t.invalidEmail); return; }
            setLoginError('');
            setLoginSuccess('');
            setAuthLoading(true);
            try {
              const token = crypto.randomUUID();
              const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
              await supabase.from('password_resets').delete().eq('email', email);
              const { error: insErr } = await supabase.from('password_resets').insert({ email, token, expires_at: expiresAt });
              if (insErr) { setLoginError(t.connectionError); setAuthLoading(false); return; }
              const appUrl = window.location.origin + window.location.pathname;
              const resetUrl = `${appUrl}?reset=${token}`;
              await emailjs.send('service_rk97p6m', 'template_i5i06pl', { to_email: email, reset_url: resetUrl });
              setLoginSuccess(t.resetEmailSent);
              setResetEmail('');
            } catch (err) {
              setLoginError(t.connectionError);
            } finally {
              setAuthLoading(false);
            }
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
              const { data: rows, error: selErr } = await supabase
                .from('password_resets')
                .select('email, expires_at')
                .eq('token', resetToken);
              if (selErr) { setLoginError(t.connectionError); setAuthLoading(false); return; }
              const row = rows && rows[0];
              if (!row || new Date(row.expires_at) < new Date()) {
                setLoginError(t.resetTokenInvalid);
                setResetToken('');
                setAuthLoading(false);
                return;
              }
              const hash = await deriveStrongHash(pw);
              const { data: updData, error: updErr } = await supabase
                .from('profiles')
                .update({ password_hash: hash })
                .eq('email', row.email);
              if (updErr) {
                setLoginError(t.connectionError);
                setAuthLoading(false);
                return;
              }
              if (!updData || updData.length === 0) {
                setLoginError('Nessun account trovato per questa email.');
                setAuthLoading(false);
                return;
              }
              await supabase.from('password_resets').delete().eq('token', resetToken);
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
            const { data, error: lookErr } = await supabase.from('profiles').select('email').eq('email', email);
            if (lookErr) { setLoginError(t.connectionError); setAuthLoading(false); return; }
            if (!data || data.length === 0) { setLoginError(t.emailNotFound); setAuthLoading(false); return; }
            try {
              const token = crypto.randomUUID();
              const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
              await supabase.from('magic_links').delete().eq('email', email);
              const { error: insErr } = await supabase.from('magic_links').insert({ email, token, expires_at: expiresAt });
              if (insErr) { setLoginError(t.connectionError); setAuthLoading(false); return; }
              const appUrl = window.location.origin + window.location.pathname;
              const magicUrl = `${appUrl}?magic=${token}`;
              await emailjs.send('service_rk97p6m', 'template_gy8gdkg', {
                to_email: email,
                subject: 'Your login link to Global Awakening',
                message: 'Click here to log in without a password.',
                magic_url: magicUrl,
                cta_text: 'Login to Global Awakening',
                footer: 'This link expires in 15 minutes.'
              });
              setLoginSuccess(t.magicLinkSent);
              setMagicLinkEmail('');
              setShowMagicLink(false);
            } catch(err) {
              console.error('EmailJS error:', JSON.stringify(err));
              setLoginError(t.connectionError);
            } finally {
              setAuthLoading(false);
            }
          };

          useEffect(() => {
            if (!magicToken) return;
            const loginWithMagicToken = async () => {
              // Cattura sid guest prima della sovrascrittura per la fusione dati
              const prevGuestSid = sessionId;
              const wasGuest = !userEmail;
              const { data: rows } = await supabase.from('magic_links').select('email, expires_at').eq('token', magicToken);
              if (!rows || rows.length === 0 || new Date(rows[0].expires_at) < new Date()) {
                setLoginError(t.magicLinkInvalid);
                return;
              }
              const email = rows[0].email;
              await supabase.from('magic_links').delete().eq('token', magicToken);
              const { data } = await supabase.from('profiles').select('*').eq('email', email);
              if (!data || data.length === 0) { setLoginError(t.emailNotFound); return; }
              const existing = data[0];
              setSessionId(existing.session_id);
              localStorage.setItem('ga_session_id', existing.session_id);
              setUserEmail(email);
              setIsGuest(false);
              // Magic-link: nessuna password digitata → prendi l'hash memorizzato dal profilo,
              // così Step B (get_my_messages) può autenticare la lettura dei messaggi.
              setPasswordHash(existing.password_hash || null);
              if (existing.password_hash) localStorage.setItem('ga_pwhash', existing.password_hash);
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
                const merged = await mergeGuestTelepathyData(prevGuestSid, email, existing.nickname || 'Anonymous');
                if (merged) {
                  setTotalRounds(merged.rounds_count);
                  setTotalMatches(merged.matches_count);
                  localStorage.setItem('telepathy_score', String(merged.rounds_count));
                  localStorage.setItem('telepathy_best', String(merged.matches_count));
                  await supabase.from('profiles').update({
                    telepathy_score: merged.rounds_count,
                    telepathy_best: merged.matches_count
                  }).eq('email', email);
                }
              }
            };
            loginWithMagicToken();
          }, [magicToken]);

          const handleLogout = () => {
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

          const sendSymbol = async () => {
            if (!selectedSymbol || !matchId) return;
            setWaitingForPartner(true);
            await supabase.from('telepathy_matches').update({
              sender_symbol: selectedSymbol,
              level: currentLevel
            }).eq('id', matchId);
          };

          const submitGuess = async () => {
            if (!guessedSymbol || !matchId) return;
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
              if (!data || data.length === 0) {
                // Il partner ha abbandonato la sessione — forza fine sessione su questo lato
                setPartnerDisconnected(true);
                setSessionEnded(true);
                setShowResult(false);
                setWaitingForPartner(false);
                return;
              }
              const match = data[0];

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
              const { data } = await supabase.from('telepathy_matches').select('id').eq('id', matchId);
              if (!data || data.length === 0) {
                setPartnerDisconnected(true);
                setSessionEnded(true);
                setShowResult(false);
                setWaitingForPartner(false);
                return;
              }
              // Controlla last_seen del partner
              if (partner?.id) {
                const { data: pu } = await supabase.from('online_users').select('last_seen').eq('id', partner.id);
                if (pu && pu.length > 0) {
                  const stale = Date.now() - new Date(pu[0].last_seen).getTime() > 35000;
                  if (stale) setPartnerDisconnected(true);
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

          // Poll per match da invito diretto (l'invitante aspetta che l'altro accetti)
          useEffect(() => {
            if (!directInviteTarget || partner) return;

            const pollForMatch = async () => {
              const { data: matches } = await supabase.from('telepathy_matches').select('*');
              if (!matches) return;
              const myMatch = matches.find(m => m.user1_id === sessionId || m.user2_id === sessionId);
              if (myMatch) {
                const amUser1 = myMatch.user1_id === sessionId;
                setPartner({ id: amUser1 ? myMatch.user2_id : myMatch.user1_id, nickname: amUser1 ? myMatch.user2_nickname : myMatch.user1_nickname });
                setRole(amUser1 ? myMatch.user1_role : myMatch.user2_role);
                setMatchId(myMatch.id);
                setDirectInviteTarget(null);
              }
            };

            pollForMatch();
            const interval = setInterval(pollForMatch, 2000);
            // Auto-sblocco: se entro 45s nessuno accetta, libera il latch e rimuove
            // l'invito pendente. Senza questo, alla scadenza il bottone "invita" resta
            // nascosto per sempre e non si puo' piu' reinvitare (stallo osservato nei test).
            const expiry = setTimeout(async () => {
              await supabase.from('telepathy_invites').delete().eq('from_id', sessionId).eq('to_id', directInviteTarget.id);
              setDirectInviteTarget(null);
            }, 45000);
            return () => { clearInterval(interval); clearTimeout(expiry); };
          }, [directInviteTarget, partner, sessionId]);

          // Chat in-match telepatia
          useEffect(() => {
            if (!matchId) return;
            const loadChat = async () => {
              const { data } = await supabase.from('telepathy_chat').select('*').eq('match_id', matchId).order('created_at', { ascending: true });
              if (data) setTelepathyChatMessages(data);
            };
            loadChat();
            const interval = setInterval(loadChat, 3000);
            return () => clearInterval(interval);
          }, [matchId]);

          // Receiver: controlla se il sender ha già inviato il simbolo
          useEffect(() => {
            if (!matchId || effectiveRole !== 'receiver' || waitingForPartner || showResult) return;

            const checkSenderSent = async () => {
              const { data } = await supabase.from('telepathy_matches').select('sender_symbol').eq('id', matchId);
              if (data && data.length > 0) {
                setSenderHasSent(!!data[0].sender_symbol);
              }
            };

            checkSenderSent();
            const interval = setInterval(checkSenderSent, 2000);
            return () => clearInterval(interval);
          }, [matchId, role, effectiveRole, waitingForPartner, showResult]);

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
              supabase.from('telepathy_invites').delete().eq('from_id', sessionId);
            }
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
            setSenderHasSent(false);
            setTelepathyChatMessages([]);
            setNewTelepathyMessage('');
          };

          const sendDirectInvite = async (targetUser) => {
            // Dedup: se ho gia' un invito pending verso qualcuno, non spammare un secondo.
            // L'utente puo' annullare il primo (flusso futuro) o aspettare scadenza/accept.
            if (directInviteTarget) {
              console.warn('sendDirectInvite: invito gia\' pending, ignoro il secondo');  // niente PII nel log (D4)
              return;
            }
            setDirectInviteTarget(targetUser);
            // Cancella eventuali inviti pendenti precedenti dello stesso mittente verso lo stesso
            // destinatario (artefatti di sessioni o tab vecchi) prima di crearne uno nuovo.
            await supabase.from('telepathy_invites').delete().eq('from_id', sessionId).eq('to_id', targetUser.id);
            const { error } = await supabase.from('telepathy_invites').insert({
              from_id: sessionId,
              from_name: nickname || 'Anonymous',
              to_id: targetUser.id,
              to_name: targetUser.nickname,
              status: 'pending'
            });
            if (error) {
              console.warn('Failed to send invite:', error);
              setDirectInviteTarget(null);
              return;
            }
            await supabase.from('notifications').insert({
              user_nickname: targetUser.nickname,
              type: 'telepathy_invite',
              message: `${nickname} ti ha invitato a un training telepatico`
            });
          };

          // Annulla l'invito in sospeso: libera il latch lato client e rimuove la riga
          // pendente dal DB, così il bottone "invita" ricompare e si puo' reinviare.
          const cancelDirectInvite = async () => {
            const target = directInviteTarget;
            setDirectInviteTarget(null);
            if (target) {
              await supabase.from('telepathy_invites').delete().eq('from_id', sessionId).eq('to_id', target.id);
            }
          };

          const acceptInvite = async () => {
            if (!incomingInvite) return;
            // Guard: non accettare se sono gia' in un match (evita di sovrascrivere lo stato)
            if (matchId || partner) {
              console.warn('acceptInvite: gia\' in sessione, ignoro invito');
              return;
            }
            // Anticipare setSearchingPartner(false) per evitare che findPartner crei un altro match
            // in parallelo durante l'await dell'INSERT (race con random matching).
            setSearchingPartner(false);
            const myRole = Math.random() > 0.5 ? 'sender' : 'receiver';
            const theirRole = myRole === 'sender' ? 'receiver' : 'sender';
            const { data: matchData, error: matchError } = await supabase.from('telepathy_matches').insert({
              user1_id: incomingInvite.from_id,
              user1_nickname: incomingInvite.from_name,
              user1_role: theirRole,
              user2_id: sessionId,
              user2_nickname: nickname || 'Anonymous',
              user2_role: myRole,
              level: 'lvl3', // ogni sessione parte dal livello più facile (3 card)
              round_count: 0
            });
            if (matchError || !matchData || matchData.length === 0) {
              console.warn('Failed to create match:', matchError);
              return;
            }
            await supabase.from('telepathy_invites').update({ status: 'accepted' }).eq('id', incomingInvite.invite_id);
            // L'insert con Prefer: return=representation ritorna direttamente il record creato.
            setMatchId(matchData[0].id);
            setPartner({ id: incomingInvite.from_id, nickname: incomingInvite.from_name });
            setRole(myRole);
            setIncomingInvite(null);
            setSessionEnded(false);
            setPartnerDisconnected(false);
            setShowResult(false);
            setSelectedSymbol(null);
            setGuessedSymbol(null);
            setPartnerSymbol(null);
            setWaitingForPartner(false);
            setRoundCount(0);
            setSessionMatches(0);
            setActiveTab('telepathy');
          };

          const declineInvite = async () => {
            if (!incomingInvite) return;
            await supabase.from('telepathy_invites').update({ status: 'declined' }).eq('id', incomingInvite.invite_id);
            await supabase.from('notifications').insert({
              user_nickname: incomingInvite.from_name,
              type: 'telepathy_declined',
              message: `${nickname} ha rifiutato il tuo invito al training telepatico`
            });
            setIncomingInvite(null);
          };

          const playAgainSamePartner = async () => {
            const savedPartner = partner;
            if (!savedPartner) return;
            // Verifica che il partner sia ancora online prima di rimandare l'invito,
            // altrimenti l'utente attenderebbe a vuoto.
            const { data: presence } = await supabase.from('online_users').select('id,last_seen').eq('id', savedPartner.id);
            const stillOnline = presence && presence.length > 0 &&
              (Date.now() - new Date(presence[0].last_seen).getTime() < 60000);
            if (!stillOnline) {
              alert(`${savedPartner.nickname} ${t.telepathy.partnerOffline}`);
              return;
            }
            resetTelepathy();
            await sendDirectInvite(savedPartner);
          };

          // Load profile from Supabase or localStorage
          useEffect(() => {
            const loadProfile = async () => {
              try {
                const { data } = await supabase.from('profiles').select('*').eq('session_id', sessionId);
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
            const row = {
              session_id: sessionId,
              nickname: nickname || 'Anonymous',
              bio: profile.bio,
              starseed_type: profile.starseedType,
              avatar: profile.avatar,
              country: profile.country,
              interests: profile.interests,
              experience_level: profile.experienceLevel,
              telepathy_score: totalRounds,
              telepathy_best: totalMatches,
              show_telepathy_score: showTelepathyScore
            };
            if (passwordHash) row.password_hash = passwordHash;
            if (userEmail) row.email = userEmail;
            try {
              if (!isGuest) {
                await supabase.from('profiles').upsert(row);
              }
            } catch (err) {
              console.warn('Failed to save profile to Supabase:', err);
            }
            localStorage.setItem('ga_profile', JSON.stringify(profile));
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
              const { data: updated } = await supabase.from('telepathy_scores').select('rounds_count,matches_count').eq('user_id', userId);
              const newRounds = (updated && updated[0]) ? (updated[0].rounds_count || 0) : (totalRounds + roundCount);
              const newMatches = (updated && updated[0]) ? (updated[0].matches_count || 0) : (totalMatches + sessionMatches);
              setTotalRounds(newRounds);
              setTotalMatches(newMatches);
              localStorage.setItem('telepathy_score', String(newRounds));
              localStorage.setItem('telepathy_best', String(newMatches));
              if (sessionId) {
                await supabase.from('profiles').update({
                  telepathy_score: newRounds,
                  telepathy_best: newMatches
                }).eq('session_id', sessionId);
              }
              if (matchId) {
                // Cancella anche la chat per non lasciare messaggi orfani in telepathy_chat
                // (la tabella non ha ON DELETE CASCADE).
                await supabase.from('telepathy_chat').delete().eq('match_id', matchId);
                await supabase.from('telepathy_matches').delete().eq('id', matchId);
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
              const { data } = await supabase.from('profiles').select('*').eq('nickname', userName);
              if (data && data.length > 0) {
                const p = data[0];
                setViewingProfile({
                  nickname: p.nickname || userName || 'Anonymous',
                  bio: p.bio || '',
                  starseedType: p.starseed_type || '',
                  avatar: p.avatar || '',
                  country: p.country || '',
                  interests: p.interests || [],
                  experienceLevel: p.experience_level || '',
                  telepathyScore: p.telepathy_score || 0,
                  telepathyBest: p.telepathy_best || 0,
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
                  telepathyScore: 0,
                  telepathyBest: 0,
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
              if (error || !Array.isArray(data)) return;  // auth fallita / rete: non tocca lo stato
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
            // Inviti telepatici scaduti (>2min): il record DB e' gia' stato cancellato dal cleanup,
            // navigare al tab telepatia non aprirebbe nessuna modal — meglio solo dismetterla.
            const isExpiredInvite = notif.type === 'telepathy_invite' && notif.created_at &&
              (Date.now() - new Date(notif.created_at).getTime() > 120000);
            if (isExpiredInvite) return;
            if (notif.type === 'private_message') {
              // Forza reload immediato dei messaggi privati prima di aprire il profilo,
              // così la conversazione non appare vuota anche se il poll (8s) non è ancora scattato.
              try {
                const { data: sent } = await supabase.from('private_messages').select('*').eq('sender_name', nickname);
                const { data: received } = await supabase.from('private_messages').select('*').eq('receiver_name', nickname);
                const all = [...(sent || []), ...(received || [])];
                all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                setPrivateMessages(all);
              } catch (err) { console.warn('reload private_messages failed', err); }
              const senderMatch = notif.message.match(/^(.+) ti ha inviato/);
              if (senderMatch) openProfile(senderMatch[1]);
            } else {
              if (notif.type === 'telepathy_invite') {
                // Fetch immediato dell'invito senza aspettare il prossimo ciclo di updatePresence
                const { data: invites } = await supabase.from('telepathy_invites')
                  .select('*').eq('to_id', sessionId).eq('status', 'pending');
                if (invites && invites.length > 0) {
                  const inv = invites[0];
                  setIncomingInvite({ from_id: inv.from_id, from_name: inv.from_name, invite_id: inv.id });
                }
              }
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
              alert('Please fill in name, date and time.');
              return;
            }

            const ritualData = {
              creator: nickname || 'Anonymous',
              creator_id: sessionId,
              name: newRitual.name,
              description: newRitual.description,
              type: newRitual.type,
              sacred_number: newRitual.sacredNumber,
              date: newRitual.date,
              time: newRitual.time,
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
                p_password_hash: passwordHash
              });
              if (error) {
                console.warn('Supabase RPC create_ritual error:', error);
                setSavingContent(false);
                showErrorToast();
                return;  // modale resta aperto, form non svuotato
              }
              if (Array.isArray(data) && data[0]) {
                setRituals(prev => [data[0], ...prev]);
              }
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
              duration: 30
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

          const joinRitual = async (ritualId) => {
            const ritual = rituals.find(r => r.id === ritualId);
            if (!ritual || ritual.participants.includes(sessionId)) return;
            await supabase.rpc('join_ritual', { p_ritual_id: ritualId, p_session_id: sessionId });
            if (ritual.creator && ritual.creator !== nickname) {
              await supabase.from('notifications').insert({
                user_nickname: ritual.creator,
                type: 'ritual_join',
                message: `${nickname} si è unito/a al tuo rituale "${ritual.name}"`
              });
            }
          };

          const sendEnergy = async (ritualId) => {
            const ritual = rituals.find(r => r.id === ritualId);
            if (!ritual) return;
            await supabase.rpc('send_ritual_energy', { p_ritual_id: ritualId, p_amount: 10 });
          };

          const toggleCandle = async (ritualId) => {
            const { data, error } = await supabase.rpc('toggle_ritual_candle', {
              p_ritual_id: ritualId,
              p_session_id: sessionId
            });
            if (error || !data || data.length === 0) { showErrorToast(); return; }
            setRituals(prev => prev.map(r => r.id === ritualId ? data[0] : r));
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

          const toggleRitualComments = async (ritualId) => {
            if (expandedRitualId === ritualId) { setExpandedRitualId(null); return; }
            setExpandedRitualId(ritualId);
            if (!ritualCommentsMap[ritualId]) {
              const { data } = await supabase.from('ritual_comments').select('*').eq('ritual_id', ritualId).order('created_at', { ascending: true });
              if (data) setRitualCommentsMap(prev => ({ ...prev, [ritualId]: data }));
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
            if (data) setCommentsMap(prev => ({ ...prev, [postId]: data }));
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
                <div className="absolute top-4 right-4">
                  <button onClick={() => setLang(lang === 'en' ? 'it' : 'en')} className="btn-secondary">
                    {lang === 'en' ? '🌐 EN' : '🌐 IT'}
                  </button>
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
                        <input
                          type="password"
                          value={tempPassword}
                          onChange={(e) => { setTempPassword(e.target.value); setLoginError(''); }}
                          placeholder="Password"
                          aria-label="Password"
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
                        <input
                          type="password"
                          value={resetNewPassword}
                          onChange={(e) => { setResetNewPassword(e.target.value); setLoginError(''); }}
                          placeholder={t.newPasswordPlaceholder}
                          aria-label={t.newPasswordPlaceholder}
                        />
                        <input
                          type="password"
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
                        <input
                          type="password"
                          value={tempPassword}
                          onChange={(e) => { setTempPassword(e.target.value); setLoginError(''); }}
                          placeholder="Password"
                          aria-label="Password"
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
                      <button onClick={() => setLang(lang === 'en' ? 'it' : 'en')} className="btn-secondary px-3 py-2">
                        {lang === 'en' ? '🌐 EN' : '🌐 IT'}
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="text-white font-medium" style={{cursor: 'pointer'}} onClick={() => setShowEditProfile(true)} title={t.editProfile}>{profile.avatar && <span style={{marginRight: '0.25rem'}}>{profile.avatar}</span>}{nickname}</div>
                        <span style={{
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
                              <p style={{color: '#a78bfa', fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem'}}>Nessuna notifica</p>
                            ) : (
                              <>
                                {notifItems.map(n => {
                                  const tabTarget = n.type === 'telepathy_invite' ? 'telepathy' : n.type === 'comment' ? 'consciousness' : n.type === 'private_message' ? null : 'rituals';
                                  const icon = n.type === 'comment' || n.type === 'ritual_comment' ? '💬' : n.type === 'ritual_join' ? '🌟' : n.type === 'private_message' ? '✉️' : n.type === 'telepathy_declined' ? '❌' : '🧠';
                                  const isExpiredInvite = n.type === 'telepathy_invite' && n.created_at &&
                                    (Date.now() - new Date(n.created_at).getTime() > 120000);
                                  return (
                                  <div key={n.id} style={{
                                    padding: '0.5rem 0.25rem',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    opacity: isExpiredInvite ? 0.6 : 1
                                  }}>
                                    <span style={{fontSize: '1rem'}}>{icon}</span>
                                    <span style={{flex: 1, color: '#e5e7eb', fontSize: '0.82rem'}}>
                                      {n.message}
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
                                      onClick={() => markOneNotifRead(n, tabTarget)}
                                      className="btn-primary"
                                      style={{fontSize: '0.75rem', padding: '0.2rem 0.6rem', whiteSpace: 'nowrap'}}
                                    >{isExpiredInvite ? 'OK' : 'Vai'}</button>
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
                      title="Vedi gli utenti online (Community)"
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
              <nav className="main-nav-bottom" aria-label="Sezioni principali">
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
                          ⚡ Test (3 min)
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

                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem'}}>
                      {rituals.map(ritual => {
                        const status = getRitualStatus(ritual);
                        const isLive = status === 'live';
                        const isJoined = ritual.participants.includes(sessionId);
                        const candleCount = (ritual.candles || []).length;
                        const isCandleLit = (ritual.candles || []).includes(sessionId);
                        
                        const ritualComments = ritualCommentsMap[ritual.id] || [];
                        const isRitualExpanded = expandedRitualId === ritual.id;
                        return (
                          <div key={ritual.id} className={`ritual-card ${isLive ? 'ritual-live' : ''}`}>
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div style={{fontSize: '2rem'}} className="mb-2">{ritualTypes.find(t => t.id === ritual.type)?.icon}</div>
                                <h3 className="text-xl font-bold text-white mb-1">{ritual.name}</h3>
                                <p className="text-secondary text-sm">{ritual.description}</p>
                                {ritual.creator && (
                                  <span
                                    className="text-xs"
                                    style={{color: '#a78bfa', cursor: 'pointer', textDecoration: 'underline dotted'}}
                                    onClick={() => openProfile(ritual.creator)}
                                  >✦ {ritual.creator}</span>
                                )}
                              </div>
                              <div className="text-2xl" style={{color: '#fbbf24'}}>{ritual.sacred_number}</div>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                              <Calendar style={{width: '1rem', height: '1rem', color: '#a78bfa'}} />
                              <span className="text-primary text-sm">{ritual.date} {ritual.time} UTC</span>
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

                            <div className="flex gap-2 mb-3">
                              <button
                                onClick={() => joinRitual(ritual.id)}
                                className={isJoined ? 'btn-secondary flex-1' : 'btn-primary flex-1'}
                                disabled={isJoined || status === 'ended'}
                              >
                                {isJoined ? t.rituals.joined : t.rituals.join}
                              </button>
                              {isLive && (
                                <button onClick={() => sendEnergy(ritual.id)} className="btn-secondary px-4">
                                  ⚡ {ritual.energy}
                                </button>
                              )}
                              <button
                                onClick={() => toggleCandle(ritual.id)}
                                className="px-4"
                                aria-label={isCandleLit ? t.rituals.candleExtinguish : t.rituals.candleLight}
                                title={isCandleLit ? t.rituals.candleExtinguish : t.rituals.candleLight}
                                style={{
                                  borderRadius: '0.75rem',
                                  border: isCandleLit ? '1px solid rgba(251,191,36,0.7)' : '1px solid rgba(255,255,255,0.2)',
                                  background: isCandleLit ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.06)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <span style={{filter: isCandleLit ? 'none' : 'grayscale(1) opacity(0.6)'}}>🕯️</span> {candleCount}
                              </button>
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
                                {ritualComments.map(c => (
                                  <div key={c.id} style={{marginBottom: '0.75rem', paddingLeft: '1rem', borderLeft: '2px solid rgba(124,58,237,0.4)'}}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className="text-primary font-medium text-xs"
                                        style={{cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(167,139,250,0.4)'}}
                                        onClick={() => openProfile(c.author_nickname)}
                                      >{c.author_nickname}</span>
                                      <span style={{color: '#c4b5fd'}} className="text-xs">{new Date(c.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-white" style={{fontSize: '0.9rem'}}>{c.content}</p>
                                  </div>
                                ))}
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
                              <span style={{color: '#c4b5fd'}} className="text-xs">{new Date(post.created_at).toLocaleString()}</span>
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
                                {postComments.map(c => (
                                  <div key={c.id} style={{marginBottom: '0.75rem', paddingLeft: '1rem', borderLeft: '2px solid rgba(124,58,237,0.4)'}}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className="text-primary font-medium text-xs"
                                        style={{cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(167,139,250,0.4)'}}
                                        onClick={() => openProfile(c.author_nickname)}
                                      >{c.author_nickname}</span>
                                      <span style={{color: '#c4b5fd'}} className="text-xs">{new Date(c.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-white" style={{fontSize: '0.9rem'}}>{c.content}</p>
                                  </div>
                                ))}
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
                          alt="World map"
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
                      <Brain style={{width: '4rem', height: '4rem', margin: '0 auto 1rem', color: '#a78bfa'}} />
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

                        {/* Lista utenti online */}
                        {onlineUsersForTelepathy.length > 0 && (
                          <div className="bg-glass-dark rounded-xl p-4">
                            <h3 className="text-white font-bold mb-3">{t.telepathy.onlineUsers} ({onlineUsersForTelepathy.length})</h3>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                              {onlineUsersForTelepathy.map(u => (
                                <div key={u.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)'}}>
                                  <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                    <span style={{width: '0.6rem', height: '0.6rem', borderRadius: '50%', background: u.status === 'available' ? '#4ade80' : '#9ca3af', display: 'inline-block'}} />
                                    <span className="text-white text-sm font-medium" style={{cursor: 'pointer', textDecoration: 'underline dotted'}} onClick={() => openProfile(u.nickname)}>{u.nickname}</span>
                                    <span className="text-secondary text-xs">{u.status === 'busy' ? t.telepathy.inSession : t.telepathy.available}</span>
                                  </div>
                                  {u.status === 'available' && directInviteTarget?.id !== u.id && (
                                    <button
                                      onClick={() => sendDirectInvite(u)}
                                      className="btn-primary"
                                      style={{fontSize: '0.75rem', padding: '0.3rem 0.75rem'}}
                                    >
                                      {t.telepathy.propose}
                                    </button>
                                  )}
                                  {directInviteTarget?.id === u.id && (
                                    <span style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                      <span className="text-secondary text-xs">{t.telepathy.inviteSent}</span>
                                      <button
                                        onClick={cancelDirectInvite}
                                        className="text-secondary text-xs"
                                        style={{textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0}}
                                      >
                                        {t.telepathy.cancel}
                                      </button>
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Abbinamento random */}
                        <button onClick={startSearching} className="btn-primary w-full" style={{fontSize: '1.125rem'}}>
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
                                  <div key={row.user_id || i} style={{display: 'flex', alignItems: 'center', padding: '0.5rem', borderRadius: '0.6rem', background: i < 3 ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)'}}>
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
                            <p className="text-secondary text-sm mt-2">{queueSize - 1} {queueSize > 2 ? t.telepathy.starseedsWaiting : t.telepathy.starseedWaiting}</p>
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
                            <p className="text-white font-bold">{partner?.nickname}</p>
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
                        <div className="tele-col tele-col-game" style={{flex: '1 1 280px', minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
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
                                  <p className="text-white text-center mb-4 font-medium">{t.telepathy.pickSymbol}</p>
                                  <div className="grid grid-cols-3 gap-4 mb-6">
                                    {getCurrentSymbols(currentLevel).map((symbol) => (
                                      <button key={symbol.id} onClick={() => setSelectedSymbol(symbol.id)} className={`symbol-btn ${selectedSymbol === symbol.id ? 'symbol-btn-selected' : ''}`}>
                                        {symbol.icon}
                                      </button>
                                    ))}
                                  </div>
                                  <button onClick={sendSymbol} disabled={!selectedSymbol} className="btn-primary w-full">{t.telepathy.sendTelepathically}</button>
                                </div>
                              )}

                              {!showLevelBanner && effectiveRole === 'receiver' && !waitingForPartner && (
                                <div>
                                  {senderHasSent ? (
                                    <p className="text-white text-center mb-4 font-medium">{t.telepathy.symbolSentGuess}</p>
                                  ) : (
                                    <p className="text-primary text-center mb-4 font-medium">⏳ {partner?.nickname} {t.telepathy.waitingForSend}</p>
                                  )}
                                  <div className={`grid grid-cols-3 gap-4 mb-6 ${!senderHasSent ? 'symbols-locked' : ''}`}>
                                    {getCurrentSymbols(currentLevel).map((symbol) => (
                                      <button key={symbol.id} disabled={!senderHasSent} onClick={() => setGuessedSymbol(symbol.id)} className={`symbol-btn ${guessedSymbol === symbol.id ? 'symbol-btn-selected' : ''}`}>
                                        {symbol.icon}
                                      </button>
                                    ))}
                                  </div>
                                  <button onClick={submitGuess} disabled={!guessedSymbol || !senderHasSent} className="btn-primary w-full">{t.telepathy.confirm}</button>
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
                                    {msg.sender_name !== nickname && <p className="text-secondary" style={{fontSize: '0.65rem'}}>{msg.sender_name}</p>}
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
                          onClick={() => {
                            const newVal = !showTelepathyScore;
                            setShowTelepathyScore(newVal);
                            localStorage.setItem('ga_show_telepathy', String(newVal));
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
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
                      {/* Avatar Emoji */}
                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.profile.avatar}</label>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '0.5rem'}}>
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
                            <input
                              type="password"
                              value={profilePassword}
                              onChange={(e) => { setProfilePassword(e.target.value); setProfilePasswordMsg(''); }}
                              placeholder="New password..."
                              style={{flex: 1}}
                            />
                            <button
                              className="btn-secondary px-4"
                              disabled={!profilePassword.trim()}
                              onClick={async () => {
                                const hash = await deriveStrongHash(profilePassword.trim());
                                setPasswordHash(hash);
                                localStorage.setItem('ga_pwhash', hash);
                                await supabase.from('profiles').upsert({
                                  session_id: sessionId,
                                  nickname: nickname || 'Anonymous',
                                  email: userEmail,
                                  password_hash: hash
                                });
                                setProfilePassword('');
                                setProfilePasswordMsg(t.passwordSet);
                                setTimeout(() => setProfilePasswordMsg(''), 3000);
                              }}
                            >
                              {t.changePassword}
                            </button>
                          </div>
                          {profilePasswordMsg && (
                            <div className="result-success rounded-xl p-2 text-center mt-2">
                              <p style={{color: '#4ade80'}} className="font-bold text-sm">{profilePasswordMsg}</p>
                            </div>
                          )}
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
                                <p className="text-2xl font-bold" style={{color: '#fbbf24'}}>{viewingProfile.telepathyScore}</p>
                              </div>
                              <div className="bg-glass-dark rounded-xl p-3 text-center">
                                <p className="text-secondary text-xs mb-1">{t.social.bestScore}</p>
                                <p className="text-2xl font-bold" style={{color: '#4ade80'}}>{viewingProfile.telepathyScore > 0 ? Math.round((viewingProfile.telepathyBest / viewingProfile.telepathyScore) * 100) : 0}%</p>
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
                                      <p style={{fontSize: '0.6rem', color: '#c4b5fd', marginTop: '0.1rem', textAlign: isMe ? 'right' : 'left'}}>
                                        {new Date(msg.created_at).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})}
                                      </p>
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
                    <button onClick={acceptInvite} className="btn-primary" style={{flex: 1, fontSize: '0.85rem', padding: '0.4rem 0.6rem'}}>{t.telepathy.acceptBtn}</button>
                    <button onClick={declineInvite} className="btn-secondary" style={{flex: 1, fontSize: '0.85rem', padding: '0.4rem 0.6rem'}}>{t.telepathy.declineBtn}</button>
                  </div>
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

              {showIosInstall && (
                <div className="modal-overlay" onClick={() => setShowIosInstall(false)} style={{zIndex: 70}}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '22rem'}}>
                    <h3 className="text-xl font-bold text-white mb-2">{t.pwaIosTitle}</h3>
                    <p className="text-secondary text-sm mb-4">{t.pwaIosBody}</p>
                    <button className="btn-primary w-full" onClick={() => setShowIosInstall(false)}>{t.pwaIosClose}</button>
                  </div>
                </div>
              )}

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
                          placeholder="e.g., Full Moon Meditation"
                          maxLength={80}
                        />
                      </div>

                      <div>
                        <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.description}</label>
                        <textarea
                          value={newRitual.description}
                          onChange={(e) => setNewRitual({...newRitual, description: e.target.value})}
                          placeholder="Describe the ritual..."
                          rows="3"
                          maxLength={500}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-white text-sm mb-2" style={{display: 'block'}}>{t.rituals.type}</label>
                          <select value={newRitual.type} onChange={(e) => setNewRitual({...newRitual, type: e.target.value})}>
                            {ritualTypes.map(type => (
                              <option key={type.id} value={type.id}>{type.icon} {type.name}</option>
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
                          min="5"
                          max="180"
                        />
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
              {renderFooter()}
              {renderPrivacyModal()}
            </div>
          );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(GlobalAwakeningPlatform));
    