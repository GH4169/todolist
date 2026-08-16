// AI 伙伴页面：会话、流式回答、来源排除、长期记忆与提案确认。
(function initAiCompanion() {
  const view = document.getElementById('aiCompanionView');
  if (!view) return;
  const nav = document.getElementById('aiCompanionNav');
  const conversationList = document.getElementById('aiConversationList');
  const conversationPanel = document.getElementById('aiConversationPanel');
  const chatLayout = document.getElementById('aiChatLayout');
  const messageList = document.getElementById('aiMessageList');
  const emptyState = document.getElementById('aiEmptyState');
  const chatTitle = document.getElementById('aiChatTitle');
  const chatStatus = document.getElementById('aiChatStatus');
  const chatForm = document.getElementById('aiChatForm');
  const input = document.getElementById('aiChatInput');
  const sendButton = document.getElementById('aiSendButton');
  const stopButton = document.getElementById('aiStopButton');
  const memoryPanel = document.getElementById('aiMemoryPanel');
  const memoryList = document.getElementById('aiMemoryList');
  const proposalPanel = document.getElementById('aiProposalPanel');
  const proposalList = document.getElementById('aiProposalList');
  const proposalCount = document.getElementById('aiProposalCount');
  const proposalTabCount = document.getElementById('aiProposalTabCount');
  const tokenList = document.getElementById('integrationTokenList');
  const tokenCreate = document.getElementById('integrationTokenCreate');
  const tokenName = document.getElementById('integrationTokenName');
  const tokenOnce = document.getElementById('integrationTokenOnce');
  const createTokenButton = document.getElementById('createIntegrationTokenBtn');
  const cancelTokenButton = document.getElementById('cancelIntegrationTokenBtn');
  const saveTokenButton = document.getElementById('saveIntegrationTokenBtn');
  const scopeRead = document.getElementById('integrationScopeRead');
  const scopeProposal = document.getElementById('integrationScopeProposal');
  const newConversationButton = document.getElementById('aiNewConversationButton');
  const memoriesButton = document.getElementById('aiMemoriesButton');
  const mobileConversationsButton = document.getElementById('aiMobileConversationsButton');
  const mobileConversationClose = document.getElementById('aiMobileConversationClose');
  let activeConversationId = null;
  let activeMessages = [];
  let liveAssistant = null;
  let activeController = null;
  let loading = false;
  let loadingData = false;
  let activeTab = 'chat';
  const excludedByMessage = new Map();

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function textMarkup(value) {
    return esc(value).replace(/\n/g, '<br>');
  }

  function formatTime(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return ''; }
  }

  function currentConversation() {
    return (typeof aiConversations !== 'undefined' ? aiConversations : []).find(item => item.id === activeConversationId) || null;
  }

  function setStatus(message, busy) {
    chatStatus.textContent = message || (busy ? '正在回答' : '准备好了');
    chatStatus.classList.toggle('is-busy', Boolean(busy));
    input.disabled = Boolean(busy);
    sendButton.disabled = Boolean(busy);
    stopButton.hidden = !busy;
  }

  function renderConversations() {
    const items = typeof aiConversations !== 'undefined' ? aiConversations : [];
    conversationList.innerHTML = items.length ? items.map(item => (
      '<li><button type="button" class="ai-conversation-item' + (item.id === activeConversationId ? ' active' : '') + '" data-ai-conversation-id="' + esc(item.id) + '">' +
      '<span class="ai-conversation-item-title">' + esc(item.title) + '</span><small>' + esc(formatTime(item.lastActiveAt)) + '</small>' +
      '<span class="ai-conversation-item-actions"><i data-ai-rename="' + esc(item.id) + '" title="重命名" aria-label="重命名">✎</i><i data-ai-delete="' + esc(item.id) + '" title="删除" aria-label="删除">×</i></span></button></li>'
    )).join('') : '<li class="ai-list-empty">还没有对话</li>';
  }

  function sourceFor(ref, message) {
    const context = message && message.contextSnapshot;
    const sources = context && Array.isArray(context.sources) ? context.sources : [];
    return sources.find(source => source.ref === ref) || null;
  }

  function renderCitations(message) {
    const result = message.result || {};
    const citations = Array.isArray(result.citations) ? result.citations : [];
    if (!citations.length) return '';
    const excluded = excludedByMessage.get(message.id) || new Set();
    return '<div class="ai-citation-block"><span class="ai-meta-label">本轮引用</span><div class="ai-citation-list">' + citations.map(citation => {
      const source = sourceFor(citation.ref, message);
      const hidden = excluded.has(citation.ref);
      return '<div class="ai-citation-row"><button type="button" class="ai-citation' + (hidden ? ' is-excluded' : '') + '" data-ai-source-ref="' + esc(citation.ref) + '" data-ai-message-id="' + esc(message.id) + '" title="' + esc(source ? source.content : citation.claim) + '">' +
        '<span>' + esc(source ? source.title : citation.ref) + '</span><small>' + (hidden ? '已排除' : esc(citation.claim)) + '</small></button><button type="button" class="ai-citation-exclude" data-ai-exclude-ref="' + esc(citation.ref) + '" data-ai-message-id="' + esc(message.id) + '">' + (hidden ? '恢复' : '排除') + '</button></div>';
    }).join('') + '</div></div>';
  }

  function renderAssistantExtras(message) {
    const result = message.result || {};
    const followups = Array.isArray(result.suggested_followups) ? result.suggested_followups : [];
    const memories = Array.isArray(result.memory_proposals) ? result.memory_proposals : [];
    const excluded = excludedByMessage.get(message.id) || new Set();
    let html = renderCitations(message);
    if (memories.length) {
      html += '<div class="ai-memory-proposal"><span class="ai-meta-label">长期记忆建议</span>' + memories.map(memory => '<div><span class="ai-memory-kind">' + (memory.kind === 'explicit_statement' ? '明确陈述' : '观察到的模式') + '</span><span>' + esc(memory.content) + '</span></div>').join('') + '</div>';
    }
    if (Array.isArray(result.limitations) && result.limitations.length) {
      html += '<div class="ai-limitations">' + result.limitations.map(item => '<span>' + esc(item) + '</span>').join('') + '</div>';
    }
    html += '<div class="ai-message-actions">' + (followups.length ? followups.map(item => '<button type="button" data-ai-followup="' + esc(item) + '">' + esc(item) + '</button>').join('') : '') +
      '<button type="button" data-ai-retry="' + esc(message.id) + '" data-ai-excluded="' + esc(Array.from(excluded).join(',')) + '">重新回答</button></div>';
    return html;
  }

  function renderMessages() {
    const messages = activeMessages.slice();
    if (liveAssistant) messages.push(liveAssistant);
    emptyState.hidden = messages.length > 0;
    messageList.innerHTML = messages.length ? messages.map(message => {
      const isUser = message.role === 'user';
      const status = message.status || 'completed';
      const content = message.content || (status === 'searching' || status === 'streaming' ? '正在整理相关记录…' : '');
      const error = status === 'failed' ? '<p class="ai-message-error">这轮回答没有完成，请重试。</p>' : status === 'stopped' ? '<p class="ai-message-error">这轮回答已停止，可以重新回答。</p>' : '';
      const extras = !isUser && ['completed', 'failed', 'stopped'].includes(status) ? renderAssistantExtras(message) : '';
      return '<article class="ai-message ' + (isUser ? 'is-user' : 'is-assistant') + '" data-ai-message="' + esc(message.id || '') + '"><div class="ai-message-role">' + (isUser ? '你' : 'AI 伙伴') + '<time>' + esc(formatTime(message.createdAt)) + '</time></div><div class="ai-message-body">' + textMarkup(content) + '</div>' + error + extras + '</article>';
    }).join('') : '<div class="ai-empty-state" id="aiEmptyState"><strong>从一个真实问题开始</strong><span>你可以聊工作、生活、关系、选择或情绪。</span></div>';
    messageList.scrollTop = messageList.scrollHeight;
  }

  async function loadConversation(id) {
    activeConversationId = id;
    const conversation = currentConversation();
    chatTitle.textContent = conversation ? conversation.title : '新对话';
    renderConversations();
    try {
      activeMessages = await loadAiChatMessages(id);
      renderMessages();
      setStatus('准备好了', false);
    } catch (error) {
      activeMessages = [];
      renderMessages();
      setStatus(error.message || '无法读取会话', false);
    }
  }

  async function ensureData() {
    if (loadingData || typeof currentUserId === 'undefined' || !currentUserId) return;
    loadingData = true;
    try {
      await loadAiConversations();
      if (!aiConversations.length) await createAiConversation();
      if (!activeConversationId || !aiConversations.some(item => item.id === activeConversationId)) activeConversationId = aiConversations[0].id;
      renderConversations();
      await loadConversation(activeConversationId);
      await loadAiProposals();
      renderProposals();
    } catch (error) {
      setStatus(error.message || 'AI 伙伴暂时不可用', false);
      messageList.innerHTML = '<div class="ai-empty-state"><strong>暂时无法加载</strong><span>' + esc(error.message || '请稍后重试') + '</span></div>';
    } finally { loadingData = false; }
  }

  function showView() {
    if (typeof taskWorkspace !== 'undefined') taskWorkspace.hidden = true;
    if (typeof settingsView !== 'undefined') settingsView.hidden = true;
    view.hidden = false;
    if (typeof settingsBtn !== 'undefined') settingsBtn.classList.remove('active');
    if (typeof closeMobileSidebar === 'function') closeMobileSidebar();
    nav.classList.add('active');
    nav.setAttribute('aria-current', 'page');
    void ensureData();
  }

  function setTab(tab) {
    activeTab = tab;
    view.querySelectorAll('[data-ai-tab]').forEach(button => {
      const active = button.dataset.aiTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    chatLayout.hidden = tab !== 'chat';
    proposalPanel.hidden = tab !== 'proposals';
    memoryPanel.hidden = true;
    if (tab === 'proposals') renderProposals();
  }

  async function sendQuestion(options) {
    if (loading || !activeConversationId) return;
    const text = String(options && options.text || '').trim();
    if (!text && !options.userMessageId) return;
    loading = true;
    const optimisticUser = options.userMessageId ? null : { id: 'local-user-' + Date.now(), role: 'user', content: text, status: 'completed', createdAt: Date.now() };
    liveAssistant = { id: 'local-assistant-' + Date.now(), role: 'assistant', content: '', status: 'searching', createdAt: Date.now(), result: null, contextSnapshot: null };
    if (optimisticUser) activeMessages = activeMessages.concat(optimisticUser);
    renderMessages();
    input.value = '';
    setStatus('正在查找相关记录', true);
    try {
      await streamAiChat({ conversationId: activeConversationId, message: text, userMessageId: options.userMessageId || null, revisionOfId: options.revisionOfId || null, excludeRefs: options.excludeRefs || [] }, {
        onController(controller) { activeController = controller; },
        onEvent(event) {
          if (!liveAssistant) return;
          if (event.type === 'status') setStatus(event.message, true);
          if (event.type === 'context') {
            liveAssistant.contextSnapshot = { sources: event.sources || [], limitations: event.limitations || [] };
          }
          if (event.type === 'answer.delta') {
            liveAssistant.status = 'streaming';
            liveAssistant.content += event.delta || '';
          }
          if (event.type === 'answer.completed') {
            liveAssistant.id = event.message_id || liveAssistant.id;
            liveAssistant.content = event.content || liveAssistant.content;
            liveAssistant.status = 'completed';
            liveAssistant.result = event.result || {};
            liveAssistant.contextSnapshot = event.context || liveAssistant.contextSnapshot;
          }
          renderMessages();
        },
      });
      if (liveAssistant && liveAssistant.status === 'completed') activeMessages = activeMessages.concat(liveAssistant);
      await loadAiConversations();
      if (activeConversationId) await loadConversation(activeConversationId);
      await loadAiMemories();
      renderMemoryList();
      await loadAiProposals();
      renderProposals();
    } catch (error) {
      if (error.name === 'AbortError') {
        if (liveAssistant) liveAssistant.status = 'stopped';
        setStatus('已停止', false);
      } else {
        if (liveAssistant) { liveAssistant.status = 'failed'; liveAssistant.errorCode = error.code; }
        setStatus(error.message || '回答失败', false);
      }
      renderMessages();
      try {
        await loadConversation(activeConversationId);
      } catch {
        // Keep the local failure state visible if the network is unavailable.
      }
    } finally {
      loading = false;
      activeController = null;
      liveAssistant = null;
      if (!input.disabled) input.focus();
      setStatus(chatStatus.textContent, false);
    }
  }

  function renderMemoryList() {
    const memories = typeof aiMemories !== 'undefined' ? aiMemories : [];
    memoryList.innerHTML = memories.length ? memories.map(memory => '<article class="ai-memory-item ' + (memory.status === 'enabled' ? 'is-enabled' : '') + '"><div><span class="ai-memory-kind">' + (memory.kind === 'explicit_statement' ? '明确陈述' : '观察模式') + '</span><p>' + esc(memory.content) + '</p></div><span class="ai-memory-status">' + ({ enabled: '已启用', proposed: '待确认', disabled: '已停用', rejected: '已拒绝' }[memory.status] || memory.status) + '</span><div class="ai-memory-actions">' + (memory.status !== 'enabled' ? '<button type="button" data-memory-action="enable" data-memory-id="' + esc(memory.id) + '">启用</button>' : '<button type="button" data-memory-action="disable" data-memory-id="' + esc(memory.id) + '">停用</button>') + '<button type="button" data-memory-action="edit" data-memory-id="' + esc(memory.id) + '">编辑</button><button type="button" data-memory-action="delete" data-memory-id="' + esc(memory.id) + '">删除</button></div></article>').join('') : '<p class="ai-panel-empty">还没有长期记忆。</p>';
  }

  function renderProposals() {
    const proposals = typeof getAiProposals === 'function' ? getAiProposals() : [];
    const count = proposals.length;
    proposalCount.hidden = count === 0;
    proposalTabCount.hidden = count === 0;
    proposalCount.textContent = String(count);
    proposalTabCount.textContent = String(count);
    proposalList.innerHTML = count ? proposals.map(proposal => {
      const items = proposal.ai_change_proposal_items || proposal.items || [];
      return '<article class="ai-proposal-item"><div class="ai-proposal-heading"><div><h3>' + esc(proposal.title || '任务变更提案') + '</h3><p>' + esc(proposal.summary || '') + '</p></div><span>' + esc(proposal.status || 'pending') + '</span></div><div class="ai-proposal-items">' + items.map(item => '<label><input type="checkbox" data-proposal-item="' + esc(item.id) + '" data-proposal-id="' + esc(proposal.id) + '" ' + (item.status === 'pending' ? 'checked' : 'disabled') + '><span><b>' + esc(item.operation) + '</b><small>' + esc(item.reason || '') + '</small></span></label>').join('') + '</div><div class="ai-proposal-actions"><button type="button" data-proposal-reject="' + esc(proposal.id) + '">拒绝</button><button type="button" class="is-primary" data-proposal-apply="' + esc(proposal.id) + '">确认选中</button></div></article>';
    }).join('') : '<div class="ai-panel-empty"><strong>没有待确认提案</strong><span>Codex 或 AI 伙伴提出的任务修改会出现在这里。</span></div>';
  }

  async function renderIntegrationTokens() {
    if (!tokenList || typeof listIntegrationTokens !== 'function' || typeof currentUserId === 'undefined' || !currentUserId) return;
    try {
      const payload = await listIntegrationTokens();
      const tokens = payload.tokens || [];
      tokenList.innerHTML = tokens.length ? tokens.map(token => '<li><div><strong>' + esc(token.name) + '</strong><small>' + esc(token.token_prefix) + ' · 到期 ' + esc(formatTime(token.expires_at)) + '</small></div><button type="button" data-token-revoke="' + esc(token.id) + '">撤销</button></li>').join('') : '<li class="integration-token-empty">还没有集成令牌。</li>';
    } catch (error) {
      tokenList.innerHTML = '<li class="integration-token-empty">' + esc(error.message || '无法读取令牌') + '</li>';
    }
  }

  function openSource(ref, message) {
    const source = sourceFor(ref, message);
    if (!source) return;
    if (typeof showToast === 'function') showToast((source.title || '记录') + '：' + (source.excerpt || source.content || ''));
    if (source.type === 'todo' && typeof findTodoItem === 'function') {
      const item = findTodoItem(source.id);
      if (item && typeof openReviewTaskInWorkspace === 'function') openReviewTaskInWorkspace(item.todo.id, item.item.id);
    } else if (source.type === 'goal' && source.metadata?.todo_id && typeof openCompletionGoalDialog === 'function') {
      openCompletionGoalDialog(source.metadata.todo_id, { targetDate: source.occurred_on });
    } else if (source.type === 'completion_review' && source.metadata?.todo_id && typeof openCompletionReviewDialog === 'function') {
      openCompletionReviewDialog(source.metadata.todo_id, { reviewDate: source.occurred_on, reviewId: source.id });
    } else if (source.type === 'daily_review' && typeof openDailyReviewDialog === 'function') {
      openDailyReviewDialog({ reviewDate: source.occurred_on });
    } else if (source.type === 'work_review') {
      document.getElementById('workReviewConclusion')?.focus();
    }
  }

  nav.addEventListener('click', showView);
  if (createTokenButton) createTokenButton.addEventListener('click', () => { tokenCreate.hidden = false; tokenName.focus(); });
  if (cancelTokenButton) cancelTokenButton.addEventListener('click', () => { tokenCreate.hidden = true; });
  if (saveTokenButton) saveTokenButton.addEventListener('click', async () => {
    const scopes = [scopeRead.checked ? 'review:read' : '', scopeProposal.checked ? 'proposal:write' : ''].filter(Boolean);
    if (!tokenName.value.trim() || !scopes.length) { tokenName.focus(); return; }
    saveTokenButton.disabled = true;
    try {
      const payload = await createIntegrationToken({ name: tokenName.value.trim(), scopes });
      tokenOnce.hidden = false;
      tokenOnce.textContent = '请立即保存令牌：' + payload.token;
      tokenCreate.hidden = true;
      tokenName.value = '';
      await renderIntegrationTokens();
    } catch (error) {
      tokenOnce.hidden = false;
      tokenOnce.textContent = error.message || '创建令牌失败';
    } finally { saveTokenButton.disabled = false; }
  });
  if (tokenList) tokenList.addEventListener('click', async event => {
    const button = event.target.closest('[data-token-revoke]');
    if (!button || !window.confirm('撤销这个集成令牌？')) return;
    await revokeIntegrationToken(button.dataset.tokenRevoke);
    await renderIntegrationTokens();
  });
  window.addEventListener('settings-ai-open', () => { void renderIntegrationTokens(); });
  newConversationButton.addEventListener('click', async () => { if (loading) return; const conversation = await createAiConversation(); await loadAiConversations(); await loadConversation(conversation.id); input.focus(); });
  memoriesButton.addEventListener('click', async () => { setTab('chat'); memoryPanel.hidden = false; await loadAiMemories(); renderMemoryList(); });
  mobileConversationsButton.addEventListener('click', () => view.classList.add('ai-conversation-open'));
  mobileConversationClose.addEventListener('click', () => view.classList.remove('ai-conversation-open'));
  view.addEventListener('click', async event => {
    const conversationButton = event.target.closest('[data-ai-conversation-id]');
    if (conversationButton) { view.classList.remove('ai-conversation-open'); await loadConversation(conversationButton.dataset.aiConversationId); return; }
    const rename = event.target.closest('[data-ai-rename]');
    if (rename) { const item = currentConversation(); const target = (typeof aiConversations !== 'undefined' ? aiConversations : []).find(item => item.id === rename.dataset.aiRename); const title = window.prompt('会话名称', target ? target.title : ''); if (title) { await updateAiConversation(rename.dataset.aiRename, { title: title.trim().slice(0, 80) }); renderConversations(); if (activeConversationId === rename.dataset.aiRename) chatTitle.textContent = title.trim().slice(0, 80); } return; }
    const remove = event.target.closest('[data-ai-delete]');
    if (remove) { if (!window.confirm('删除这段对话？')) return; await deleteAiConversation(remove.dataset.aiDelete); if (!aiConversations.length) await createAiConversation(); activeConversationId = aiConversations[0].id; await loadConversation(activeConversationId); return; }
    const tab = event.target.closest('[data-ai-tab]');
    if (tab) { setTab(tab.dataset.aiTab); return; }
    const closePanel = event.target.closest('[data-ai-close-panel]');
    if (closePanel) { memoryPanel.hidden = true; proposalPanel.hidden = true; return; }
    const citation = event.target.closest('[data-ai-source-ref]');
    if (citation) { const message = activeMessages.find(item => item.id === citation.dataset.aiMessageId); if (message) openSource(citation.dataset.aiSourceRef, message); return; }
    const exclude = event.target.closest('[data-ai-exclude-ref]');
    if (exclude) { const refs = excludedByMessage.get(exclude.dataset.aiMessageId) || new Set(); if (refs.has(exclude.dataset.aiExcludeRef)) refs.delete(exclude.dataset.aiExcludeRef); else refs.add(exclude.dataset.aiExcludeRef); excludedByMessage.set(exclude.dataset.aiMessageId, refs); renderMessages(); return; }
    const followup = event.target.closest('[data-ai-followup]');
    if (followup) { input.value = followup.dataset.aiFollowup; input.focus(); return; }
    const retry = event.target.closest('[data-ai-retry]');
    if (retry) { const message = activeMessages.find(item => item.id === retry.dataset.aiRetry); if (!message) return; const user = activeMessages.find(item => item.id === message.replyToId); if (user) await sendQuestion({ text: user.content, userMessageId: user.id, revisionOfId: message.id, excludeRefs: retry.dataset.aiExcluded ? retry.dataset.aiExcluded.split(',').filter(Boolean) : [] }); return; }
    const memoryAction = event.target.closest('[data-memory-action]');
    if (memoryAction) { const memory = (typeof aiMemories !== 'undefined' ? aiMemories : []).find(item => item.id === memoryAction.dataset.memoryId); if (!memory) return; const action = memoryAction.dataset.memoryAction; if (action === 'delete' && window.confirm('删除这条长期记忆？')) await deleteAiMemory(memory.id); else if (action === 'edit') { const content = window.prompt('编辑记忆', memory.content); if (content && content.trim()) await updateAiMemory(memory.id, { content: content.trim().slice(0, 500) }); } else if (action === 'enable') await updateAiMemory(memory.id, { status: 'enabled', confirmed_at: new Date().toISOString(), disabled_at: null }); else if (action === 'disable') await updateAiMemory(memory.id, { status: 'disabled', disabled_at: new Date().toISOString() }); await loadAiMemories(); renderMemoryList(); return; }
    const apply = event.target.closest('[data-proposal-apply]');
    if (apply) { const proposal = (typeof getAiProposals === 'function' ? getAiProposals() : []).find(item => item.id === apply.dataset.proposalApply); const ids = Array.from(proposalList.querySelectorAll('[data-proposal-id="' + apply.dataset.proposalApply + '"]:checked')).map(item => item.dataset.proposalItem); if (!ids.length || !window.confirm('确认应用选中的任务修改？')) return; await applyAiProposal(apply.dataset.proposalApply, ids); renderProposals(); return; }
    const reject = event.target.closest('[data-proposal-reject]');
    if (reject && window.confirm('拒绝这组提案？')) { await rejectAiProposal(reject.dataset.proposalReject); renderProposals(); }
  });
  chatForm.addEventListener('submit', event => { event.preventDefault(); void sendQuestion({ text: input.value }); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); chatForm.requestSubmit(); } });
  stopButton.addEventListener('click', () => { if (activeController) activeController.abort(); });
  window.showAiCompanion = showView;
  window.addEventListener('ai-companion-refresh', () => { if (!view.hidden) void ensureData(); });
})();
