// ============================================================
// auth.js - 邮箱/密码认证与页面访问控制
// ============================================================

const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authMessage = document.getElementById('authMessage');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const recoveryForm = document.getElementById('recoveryForm');
const newPassword = document.getElementById('newPassword');
const confirmPassword = document.getElementById('confirmPassword');
const updatePasswordBtn = document.getElementById('updatePasswordBtn');
const recoveryMessage = document.getElementById('recoveryMessage');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');

let visibleUserId = null;
let passwordRecoveryMode = initialAuthRedirectType === 'recovery';

function setStatusMessage(element, message = '', type = '') {
  element.textContent = message;
  element.className = `auth-message${type ? ` ${type}` : ''}`;
}

function setAuthMessage(message = '', type = '') {
  setStatusMessage(authMessage, message, type);
}

function setRecoveryMessage(message = '', type = '') {
  setStatusMessage(recoveryMessage, message, type);
}

function setAuthBusy(busy) {
  loginBtn.disabled = busy;
  registerBtn.disabled = busy;
  forgotPasswordBtn.disabled = busy;
  authEmail.disabled = busy;
  authPassword.disabled = busy;
}

function setRecoveryBusy(busy) {
  updatePasswordBtn.disabled = busy;
  newPassword.disabled = busy;
  confirmPassword.disabled = busy;
}

function getCredentials() {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) throw new Error('请输入邮箱和密码');
  if (password.length < 6) throw new Error('密码至少需要 6 位');
  return { email, password };
}

async function login() {
  setAuthBusy(true);
  setAuthMessage('正在登录...');
  try {
    const { email, password } = getCredentials();
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    authPassword.value = '';
  } catch (error) {
    setAuthMessage(error.message || '登录失败', 'error');
  } finally {
    setAuthBusy(false);
  }
}

async function register() {
  if (!authForm.reportValidity()) return;
  setAuthBusy(true);
  setAuthMessage('正在创建账户...');
  try {
    const { email, password } = getCredentials();
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    authPassword.value = '';

    if (data.session) {
      setAuthMessage('注册成功，正在进入任务列表...', 'success');
    } else {
      setAuthMessage('注册成功，请查收验证邮件后再登录。', 'success');
    }
  } catch (error) {
    setAuthMessage(error.message || '注册失败', 'error');
  } finally {
    setAuthBusy(false);
  }
}

function getPasswordRecoveryRedirectUrl() {
  const redirectUrl = new URL(window.location.href);
  redirectUrl.search = '';
  redirectUrl.hash = '';
  return redirectUrl.href;
}

async function requestPasswordReset() {
  const email = authEmail.value.trim();
  if (!email) {
    setAuthMessage('请先输入您的邮箱', 'error');
    authEmail.focus();
    return;
  }
  if (!authEmail.checkValidity()) {
    authEmail.reportValidity();
    return;
  }

  setAuthBusy(true);
  setAuthMessage('正在发送重置邮件...');
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: getPasswordRecoveryRedirectUrl(),
    });
    if (error) throw error;
    setAuthMessage('重置邮件已发送，请查收', 'success');
  } catch (error) {
    setAuthMessage(error.message || '重置邮件发送失败，请稍后重试', 'error');
  } finally {
    setAuthBusy(false);
  }
}

function showLoginForm() {
  recoveryForm.hidden = true;
  authForm.hidden = false;
  recoveryForm.reset();
  setRecoveryMessage();
}

function showPasswordRecovery(session) {
  if (!session?.user) {
    passwordRecoveryMode = false;
    clearAuthRedirectParams();
    showLoginForm();
    setAuthMessage('重置链接无效或已过期，请重新发送重置邮件。', 'error');
    return;
  }

  passwordRecoveryMode = true;
  visibleUserId = null;
  stopTodoApp();
  appView.hidden = true;
  authView.hidden = false;
  authForm.hidden = true;
  recoveryForm.hidden = false;
  authEmail.value = session.user.email || authEmail.value;
  setAuthMessage();
  setRecoveryMessage();
  requestAnimationFrame(() => newPassword.focus());
}

function clearAuthRedirectParams() {
  const url = new URL(window.location.href);
  url.hash = '';
  ['code', 'error', 'error_code', 'error_description'].forEach(param => {
    url.searchParams.delete(param);
  });
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

async function submitNewPassword() {
  if (!recoveryForm.reportValidity()) return;
  if (newPassword.value !== confirmPassword.value) {
    setRecoveryMessage('两次输入的密码不一致', 'error');
    confirmPassword.focus();
    return;
  }

  setRecoveryBusy(true);
  setRecoveryMessage('正在修改密码...');
  try {
    const { data, error } = await supabaseClient.auth.updateUser({
      password: newPassword.value,
    });
    if (error) throw error;

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session || (data.user ? { user: data.user } : null);
    if (!session?.user) throw new Error('无法读取更新后的登录状态');

    setRecoveryMessage('密码修改成功，正在进入任务列表...', 'success');
    clearAuthRedirectParams();
    await new Promise(resolve => setTimeout(resolve, 700));

    passwordRecoveryMode = false;
    showLoginForm();
    await applySession(session);
  } catch (error) {
    setRecoveryMessage(error.message || '密码修改失败，请重新打开重置链接后再试', 'error');
  } finally {
    setRecoveryBusy(false);
  }
}

async function logout() {
  logoutBtn.disabled = true;
  try {
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch (error) {
    window.alert(`退出失败：${error.message || '请稍后重试'}`);
  } finally {
    logoutBtn.disabled = false;
  }
}

async function applySession(session) {
  if (passwordRecoveryMode) return;
  const user = session?.user || null;
  if (user) {
    authView.hidden = true;
    appView.hidden = false;
    userEmail.textContent = user.email || '';
    setAuthMessage();
    if (visibleUserId !== user.id) {
      visibleUserId = user.id;
      await startTodoApp(user);
    }
    return;
  }

  visibleUserId = null;
  stopTodoApp();
  appView.hidden = true;
  authView.hidden = false;
  showLoginForm();
  userEmail.textContent = '';
  authEmail.focus();
}

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  login();
});
registerBtn.addEventListener('click', register);
forgotPasswordBtn.addEventListener('click', requestPasswordReset);
recoveryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitNewPassword();
});
logoutBtn.addEventListener('click', logout);

supabaseClient.auth.onAuthStateChange((event, session) => {
  // 将异步数据加载移出 Auth 回调，避免阻塞 Supabase 内部会话锁。
  if (event === 'PASSWORD_RECOVERY') {
    setTimeout(() => showPasswordRecovery(session), 0);
    return;
  }
  if (passwordRecoveryMode) {
    if (event === 'SIGNED_OUT') {
      passwordRecoveryMode = false;
      setTimeout(() => applySession(session), 0);
    }
    return;
  }
  setTimeout(() => applySession(session), 0);
});

async function initAuth() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    passwordRecoveryMode = false;
    showLoginForm();
    setAuthMessage(error.message || '读取登录状态失败', 'error');
    return;
  }
  if (passwordRecoveryMode) {
    showPasswordRecovery(data.session);
    return;
  }
  await applySession(data.session);
}

initAuth();
