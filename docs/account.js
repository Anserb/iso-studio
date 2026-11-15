import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword,
  getAuth, onAuthStateChanged, reload, sendEmailVerification, sendPasswordResetEmail,
  setPersistence, signInWithEmailAndPassword, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const auth = getAuth(initializeApp(firebaseConfig));
auth.languageCode = 'el';
const field = (id) => document.getElementById(id);
const notice = field('auth-notice');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const titles = { signin: 'Σύνδεση', signup: 'Δημιουργία λογαριασμού', reset: 'Επαναφορά κωδικού' };
const errors = {
  'auth/email-already-in-use': 'Υπάρχει ήδη λογαριασμός με αυτό το email.',
  'auth/invalid-credential': 'Έλεγξε το email και τον κωδικό σου.',
  'auth/invalid-email': 'Έλεγξε τη διεύθυνση email.',
  'auth/network-request-failed': 'Η σύνδεση διακόπηκε. Δοκίμασε ξανά.',
  'auth/too-many-requests': 'Περίμενε λίγο πριν δοκιμάσεις ξανά.',
  'auth/weak-password': 'Διάλεξε έναν πιο ισχυρό κωδικό.',
};
let mode = 'signin';
let pending = false;

function announce(message) {
  notice.textContent = message;
  notice.hidden = !message;
}

function setMode(nextMode) {
  mode = nextMode;
  const signup = mode === 'signup';
  const reset = mode === 'reset';
  field('auth-title').textContent = titles[mode];
  field('auth-submit').textContent = reset ? 'Στείλε οδηγίες' : titles[mode];
  field('password-field').hidden = reset;
  field('password').required = !reset;
  field('password').minLength = signup ? 6 : 0;
  field('password').autocomplete = signup ? 'new-password' : 'current-password';
  field('password').value = '';
  field('confirm-field').hidden = !signup;
  field('confirm').required = signup;
  field('confirm').value = '';
  field('remember-field').hidden = mode !== 'signin';
  modeButtons.forEach((button) => {
    button.hidden = mode === 'signin' ? button.dataset.mode === 'signin' : button.dataset.mode !== 'signin';
  });
}

function render(user) {
  const verified = Boolean(user?.emailVerified);
  field('auth-loading').hidden = true;
  field('auth-panel').hidden = Boolean(user);
  field('verify-panel').hidden = !user || verified;
  field('profile-panel').hidden = !verified;
  field('sign-out').hidden = !user;
  if (!user) return;
  field('verify-email').textContent = user.email;
  field('profile-email').textContent = user.email;
  field('profile-name').value = user.displayName ?? '';
  const providers = user.providerData.map(({ providerId }) => providerId);
  const names = { password: 'Email', 'google.com': 'Google', 'microsoft.com': 'Microsoft', 'facebook.com': 'Facebook' };
  field('profile-providers').textContent = providers.map((provider) => names[provider] ?? provider).join(', ');
  field('profile-reset').hidden = !providers.includes('password');
}

async function run(action) {
  if (pending) return;
  pending = true;
  const buttons = [...document.querySelectorAll('.account-card button')];
  buttons.forEach((button) => { button.disabled = true; });
  announce('');
  try {
    await action();
  } catch (error) {
    announce(errors[error.code] ?? 'Η ενέργεια δεν ολοκληρώθηκε. Δοκίμασε ξανά.');
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    pending = false;
  }
}

async function sendReset(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  announce('Αν υπάρχει λογαριασμός με αυτό το email, θα λάβεις οδηγίες επαναφοράς.');
}

onAuthStateChanged(auth, render, () => {
  field('auth-loading').textContent = 'Ο λογαριασμός δεν είναι διαθέσιμος. Ανανέωσε τη σελίδα.';
});
modeButtons.forEach((button) => button.addEventListener('click', () => {
  setMode(button.dataset.mode);
  announce('');
  field('email').focus();
}));
field('auth-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    const email = field('email').value.trim();
    const password = field('password').value;
    if (mode === 'reset') {
      await sendReset(email);
      return;
    }
    if (mode === 'signup' && password !== field('confirm').value) {
      announce('Οι δύο κωδικοί πρέπει να ταιριάζουν.');
      field('confirm').focus();
      return;
    }
    const remember = mode === 'signin' && field('remember').checked;
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    if (mode === 'signup') {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(user);
      announce('Το email επιβεβαίωσης στάλθηκε.');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    field('password').value = '';
    field('confirm').value = '';
  });
});
field('verify-check').addEventListener('click', () => run(async () => {
  await reload(auth.currentUser);
  render(auth.currentUser);
  if (!auth.currentUser.emailVerified) announce('Το email σου περιμένει επιβεβαίωση.');
}));
field('verify-send').addEventListener('click', () => run(async () => {
  await sendEmailVerification(auth.currentUser);
  announce('Το email επιβεβαίωσης στάλθηκε ξανά.');
}));
field('profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    await updateProfile(auth.currentUser, { displayName: field('profile-name').value.trim() || null });
    render(auth.currentUser);
    announce('Το όνομά σου αποθηκεύτηκε.');
  });
});
field('profile-reset').addEventListener('click', () => run(() => sendReset(auth.currentUser.email)));
field('sign-out').addEventListener('click', () => run(async () => {
  await signOut(auth);
  setMode('signin');
}));
