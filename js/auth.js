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
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');

let visibleUserId = null;

function setAuthMessage(message = '', type = '') {
  authMessage.textContent = message;
  authMessage.className = `auth-message${type ? ` ${type}` : ''}`;
}

function setAuthBusy(busy) {
  loginBtn.disabled = busy;
  registerBtn.disabled = busy;
  authEmail.disabled = busy;
  authPassword.disabled = busy;
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
  userEmail.textContent = '';
  authEmail.focus();
}

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  login();
});
registerBtn.addEventListener('click', register);
logoutBtn.addEventListener('click', logout);

supabaseClient.auth.onAuthStateChange((_event, session) => {
  // 将异步数据加载移出 Auth 回调，避免阻塞 Supabase 内部会话锁。
  setTimeout(() => applySession(session), 0);
});

async function initAuth() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setAuthMessage(error.message || '读取登录状态失败', 'error');
    return;
  }
  await applySession(data.session);
}

initAuth();
