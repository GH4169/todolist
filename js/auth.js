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
const userNickname = document.getElementById('userNickname');
const userAvatarInitial = document.getElementById('userAvatarInitial');
const accountMenuButton = document.getElementById('accountMenuButton');
const editProfileBtn = document.getElementById('editProfileBtn');
const profileDialog = document.getElementById('profileDialog');
const profileForm = document.getElementById('profileForm');
const profileNicknameInput = document.getElementById('profileNicknameInput');
const profileEmailInput = document.getElementById('profileEmailInput');
const profileAvatarInitial = document.getElementById('profileAvatarInitial');
const profilePreviewName = document.getElementById('profilePreviewName');
const profilePreviewEmail = document.getElementById('profilePreviewEmail');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const oauthConsentView = document.getElementById('oauthConsentView');
const oauthConsentSubtitle = document.getElementById('oauthConsentSubtitle');
const oauthConsentDetails = document.getElementById('oauthConsentDetails');
const oauthConsentStatus = document.getElementById('oauthConsentStatus');
const oauthClientName = document.getElementById('oauthClientName');
const oauthAccountEmail = document.getElementById('oauthAccountEmail');
const oauthRedirectHost = document.getElementById('oauthRedirectHost');
const approveOAuthBtn = document.getElementById('approveOAuthBtn');
const denyOAuthBtn = document.getElementById('denyOAuthBtn');
const oauthAuthorizationId = new URLSearchParams(window.location.search).get('authorization_id');

let visibleUserId = null;
let visibleUser = null;
let passwordRecoveryMode = initialAuthRedirectType === 'recovery';

function getDefaultNickname(email = '') {
  return email.split('@')[0]?.trim() || '用户';
}

function getUserNickname(user) {
  const savedNickname = typeof user?.user_metadata?.display_name === 'string'
    ? user.user_metadata.display_name.trim()
    : '';
  return savedNickname || getDefaultNickname(user?.email);
}

function getAvatarInitial(name = '') {
  return Array.from(name.trim())[0]?.toLocaleUpperCase('zh-CN') || '用';
}

function renderUserProfile(user) {
  const nickname = getUserNickname(user);
  const email = user?.email || '';
  userNickname.textContent = nickname;
  userEmail.textContent = email;
  userAvatarInitial.textContent = getAvatarInitial(nickname);
  accountMenuButton.setAttribute('aria-label', `账号：${nickname}`);
}

function updateProfilePreview() {
  const nickname = profileNicknameInput.value.trim() || getDefaultNickname(visibleUser?.email);
  profileAvatarInitial.textContent = getAvatarInitial(nickname);
  profilePreviewName.textContent = nickname;
}

function openProfileEditor() {
  if (!visibleUser) return;
  setAccountMenuOpen(false);
  const nickname = getUserNickname(visibleUser);
  const email = visibleUser.email || '';
  profileNicknameInput.value = nickname;
  profileEmailInput.value = email;
  profilePreviewEmail.textContent = email;
  updateProfilePreview();
  profileDialog.showModal();
  requestAnimationFrame(() => {
    profileNicknameInput.focus();
    profileNicknameInput.select();
  });
}

async function saveProfile(event) {
  event.preventDefault();
  if (!visibleUser || !profileForm.reportValidity()) return;
  const nickname = profileNicknameInput.value.trim();
  saveProfileBtn.disabled = true;
  profileNicknameInput.disabled = true;
  saveProfileBtn.textContent = '保存中...';

  try {
    const { data, error } = await supabaseClient.auth.updateUser({
      data: { display_name: nickname },
    });
    if (error) throw error;
    if (!data.user) throw new Error('无法读取更新后的账号资料');
    visibleUser = data.user;
    renderUserProfile(visibleUser);
    profileDialog.close();
    showToast('账号资料已更新');
  } catch (error) {
    showToast(error.message || '账号资料更新失败');
  } finally {
    saveProfileBtn.disabled = false;
    profileNicknameInput.disabled = false;
    saveProfileBtn.textContent = '保存更改';
  }
}

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

function setOAuthConsentBusy(busy) {
  approveOAuthBtn.disabled = busy;
  denyOAuthBtn.disabled = busy;
}

function oauthRedirectLabel(value) {
  try {
    const url = new URL(value);
    return url.host || url.protocol.replace(':', '');
  } catch {
    return 'Gemini';
  }
}

async function showOAuthConsent(user) {
  visibleUserId = null;
  visibleUser = user;
  stopTodoApp();
  appView.hidden = true;
  authView.hidden = true;
  oauthConsentView.hidden = false;
  oauthConsentDetails.hidden = true;
  oauthConsentSubtitle.textContent = '正在读取授权请求...';
  setStatusMessage(oauthConsentStatus, '');
  setOAuthConsentBusy(true);

  try {
    const oauthApi = supabaseClient.auth.oauth;
    if (!oauthApi?.getAuthorizationDetails) throw new Error('当前浏览器中的 Supabase SDK 不支持 OAuth 授权');
    const { data, error } = await oauthApi.getAuthorizationDetails(oauthAuthorizationId);
    if (error) throw error;
    if (!data) throw new Error('授权请求不存在或已经过期');
    if (!Object.prototype.hasOwnProperty.call(data, 'authorization_id')) {
      if (!data.redirect_url) throw new Error('授权请求缺少返回地址');
      window.location.replace(data.redirect_url);
      return;
    }

    oauthClientName.textContent = data.client?.name || 'Gemini';
    oauthAccountEmail.textContent = user.email || '当前 TodoList 账号';
    oauthRedirectHost.textContent = oauthRedirectLabel(data.redirect_uri);
    oauthConsentSubtitle.textContent = `${oauthClientName.textContent} 正在请求访问你的 TodoList`;
    oauthConsentDetails.hidden = false;
    setOAuthConsentBusy(false);
  } catch (error) {
    oauthConsentSubtitle.textContent = '无法读取授权请求';
    setStatusMessage(oauthConsentStatus, error.message || '授权请求无效或已过期', 'error');
  }
}

async function decideOAuth(approved) {
  if (!oauthAuthorizationId) return;
  setOAuthConsentBusy(true);
  setStatusMessage(oauthConsentStatus, approved ? '正在授权...' : '正在拒绝...');
  try {
    const oauthApi = supabaseClient.auth.oauth;
    const action = approved ? oauthApi?.approveAuthorization : oauthApi?.denyAuthorization;
    if (!action) throw new Error('当前浏览器中的 Supabase SDK 不支持 OAuth 授权');
    const { data, error } = await action.call(oauthApi, oauthAuthorizationId, { skipBrowserRedirect: true });
    if (error) throw error;
    if (!data?.redirect_url) throw new Error('授权服务没有返回跳转地址');
    window.location.assign(data.redirect_url);
  } catch (error) {
    setStatusMessage(oauthConsentStatus, error.message || '处理授权请求失败', 'error');
    setOAuthConsentBusy(false);
  }
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
  visibleUser = null;
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
  setAccountMenuOpen(false);
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
    if (oauthAuthorizationId) {
      await showOAuthConsent(user);
      return;
    }
    oauthConsentView.hidden = true;
    authView.hidden = true;
    appView.hidden = false;
    visibleUser = user;
    renderUserProfile(user);
    setAuthMessage();
    if (visibleUserId !== user.id) {
      visibleUserId = user.id;
      await startTodoApp(user);
    }
    return;
  }

  visibleUserId = null;
  visibleUser = null;
  stopTodoApp();
  appView.hidden = true;
  oauthConsentView.hidden = true;
  authView.hidden = false;
  showLoginForm();
  if (oauthAuthorizationId) setAuthMessage('请先登录 TodoList，再确认 Gemini 的访问请求。');
  userNickname.textContent = '用户';
  userEmail.textContent = '';
  userAvatarInitial.textContent = '用';
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
editProfileBtn.addEventListener('click', openProfileEditor);
profileForm.addEventListener('submit', saveProfile);
profileNicknameInput.addEventListener('input', updateProfilePreview);
logoutBtn.addEventListener('click', logout);
approveOAuthBtn.addEventListener('click', () => decideOAuth(true));
denyOAuthBtn.addEventListener('click', () => decideOAuth(false));

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
