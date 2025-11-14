// 配置管理
async function loadConfig() {
  try {
    console.log('加载配置...');
    const result = await chrome.storage.sync.get(['apiUrl', 'username', 'password']);
    console.log('从存储读取的配置:', { 
      apiUrl: result.apiUrl, 
      username: result.username, 
      hasPassword: !!result.password 
    });
    
    const apiUrlInput = document.getElementById('api-url');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    if (!apiUrlInput || !usernameInput || !passwordInput) {
      console.error('找不到输入框元素');
      return;
    }
    
    if (result.apiUrl) {
      apiUrlInput.value = result.apiUrl;
    }
    if (result.username) {
      usernameInput.value = result.username;
    }
    if (result.password) {
      passwordInput.value = result.password;
    }
    
    // 如果有配置，显示使用说明
    if (result.apiUrl && result.username && result.password) {
      console.log('已有配置，显示使用说明');
      document.getElementById('config-section').style.display = 'none';
      document.getElementById('info-section').style.display = 'block';
    } else {
      console.log('无配置，显示配置区域');
      document.getElementById('config-section').style.display = 'block';
      document.getElementById('info-section').style.display = 'none';
    }
  } catch (error) {
    console.error('加载配置错误:', error);
    showStatus('加载配置失败：' + error.message, 'error');
  }
}

async function saveConfig() {
  try {
    console.log('开始保存配置...');
    
    const apiUrl = document.getElementById('api-url').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    console.log('配置值:', { apiUrl, username, password: password ? '***' : '' });

    if (!apiUrl || !username || !password) {
      showStatus('请填写所有配置项', 'error');
      return;
    }

    // 验证 URL 格式
    try {
      new URL(apiUrl);
    } catch (e) {
      showStatus('API 地址格式不正确，请输入完整的 URL（如：https://your-site.vercel.app）', 'error');
      return;
    }

    console.log('保存到 chrome.storage...');
    await chrome.storage.sync.set({
      apiUrl: apiUrl.replace(/\/$/, ''), // 移除末尾斜杠
      username,
      password
    });

    console.log('配置已保存到存储');
    
    // 验证保存是否成功
    const saved = await chrome.storage.sync.get(['apiUrl', 'username']);
    console.log('验证保存结果:', saved);

    showStatus('配置已保存', 'success');
    
    setTimeout(() => {
      document.getElementById('config-section').style.display = 'none';
      document.getElementById('info-section').style.display = 'block';
    }, 1000);
  } catch (error) {
    console.error('保存配置时出错:', error);
    showStatus('保存失败：' + (error.message || '未知错误'), 'error');
  }
}

// 登录获取 Token
async function login(apiUrl, username, password) {
  try {
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      let errorMessage = '登录失败';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('登录失败：' + String(error));
  }
}

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  setTimeout(() => {
    statusEl.className = 'status';
  }, 5000);
}

// 事件监听
document.addEventListener('DOMContentLoaded', async () => {
  console.log('扩展已加载');
  
  try {
    await loadConfig();
    console.log('配置加载完成');

    const saveBtn = document.getElementById('save-config');
    
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('点击保存配置按钮');
        
        // 禁用按钮防止重复点击
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        
        try {
          await saveConfig();
        } catch (err) {
          console.error('保存配置错误:', err);
          showStatus('保存失败：' + (err.message || '未知错误'), 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存配置';
        }
      });
    } else {
      console.error('找不到 save-config 按钮');
      showStatus('初始化错误：找不到保存按钮', 'error');
    }
  } catch (error) {
    console.error('初始化错误:', error);
    showStatus('初始化失败：' + error.message, 'error');
  }
});

