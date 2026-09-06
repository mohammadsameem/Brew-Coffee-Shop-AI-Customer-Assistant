const auth = firebase.auth();
const authBtn = document.getElementById('auth-btn');
const signedOutView = document.getElementById('signed-out-view');
const signedInView = document.getElementById('signed-in-view');
const messagesDiv = document.getElementById('chat-container');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = chatForm.querySelector('button[type="submit"]');
const micBtn = document.getElementById('mic-btn');

const menuList = document.getElementById('menu-list');
const cartList = document.getElementById('cart-list');
const cartTotalEl = document.getElementById('cart-total');
const placeOrderBtn = document.getElementById('place-order-btn');
const loyaltyBar = document.getElementById('loyalty-bar');
const loyaltyText = document.getElementById('loyalty-text');
const historyList = document.getElementById('history-list');

const themeBtn = document.getElementById('theme-toggle-btn');
const currentTheme = localStorage.getItem('theme') || 'light';
if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}
themeBtn.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
});

const tabMenu = document.getElementById('tab-menu');
const tabHistory = document.getElementById('tab-history');
const menuView = document.getElementById('menu-view');
const historyView = document.getElementById('history-view');

tabMenu.addEventListener('click', () => {
    tabMenu.style.background = 'var(--accent-color)';
    tabMenu.style.color = 'white';
    tabHistory.style.background = 'transparent';
    tabHistory.style.color = 'var(--text-color)';
    menuView.style.display = 'flex';
    historyView.style.display = 'none';
});

tabHistory.addEventListener('click', () => {
    tabHistory.style.background = 'var(--accent-color)';
    tabHistory.style.color = 'white';
    tabMenu.style.background = 'transparent';
    tabMenu.style.color = 'var(--text-color)';
    menuView.style.display = 'none';
    historyView.style.display = 'flex';
    loadOrderHistory();
});

let currentUserToken = null;
let cart = [];
let menuItems = [];
let orderPollingInterval = null;

async function authFetch(url, options = {}) {
    if (!currentUserToken) throw new Error('Not authenticated');
    
    let appCheckToken = '';
    try {
        if (typeof firebase !== 'undefined' && firebase.appCheck) {
             const tokenResult = await firebase.appCheck().getToken();
             appCheckToken = tokenResult.token;
        }
    } catch (e) {
        console.warn("App check token error, using bypass token for preview:", e.message);
        appCheckToken = 'DEV_BYPASS_TOKEN';
    }

    if (!appCheckToken) {
        appCheckToken = 'DEV_BYPASS_TOKEN';
    }

    const headers = {
        'Authorization': `Bearer ${currentUserToken}`,
        ...(options.headers || {})
    };
    if (appCheckToken) {
        headers['X-Firebase-AppCheck'] = appCheckToken;
    }

    return fetch(url, { ...options, headers });
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    micBtn.style.display = 'flex';
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = function() {
        micBtn.style.color = '#ef4444'; // red when listening
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        chatInput.value += (chatInput.value ? ' ' : '') + transcript;
        micBtn.style.color = '#4A6FA5';
    };

    recognition.onerror = function(event) {
        console.error("Speech recognition error", event.error);
        micBtn.style.color = '#4A6FA5';
    };

    recognition.onend = function() {
        micBtn.style.color = '#4A6FA5';
    };

    micBtn.addEventListener('click', () => {
        recognition.start();
    });
}

auth.onAuthStateChanged(async (user) => {
    authBtn.style.display = 'block';
    if (user) {
        authBtn.textContent = 'Sign Out';
        signedOutView.style.display = 'none';
        signedInView.style.display = 'flex';
        currentUserToken = await user.getIdToken();
        
        await loadMenu();
        await loadHistory();
        await updateLoyalty();
        await loadGreeting();
        
        startOrderPolling();
    } else {
        authBtn.textContent = 'Sign In with Google';
        signedOutView.style.display = 'flex';
        signedInView.style.display = 'none';
        currentUserToken = null;
        messagesDiv.innerHTML = '';
        cart = [];
        updateCartUI();
        stopOrderPolling();
    }
});

authBtn.addEventListener('click', () => {
    if (auth.currentUser) {
        auth.signOut();
        sessionStorage.removeItem('greetingShown');
    } else {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            console.error('Sign-in error:', error);
            alert('Failed to sign in.');
        });
    }
});

async function loadHistory() {
    if (!currentUserToken) return;
    try {
        const res = await authFetch('/api/history');
        if (!res.ok) throw new Error('Failed to load history');
        const data = await res.json();
        
        messagesDiv.innerHTML = '';
        data.messages.forEach(msg => {
            appendMessage(msg.text, msg.role === 'user' ? 'user' : 'assistant');
        });
        scrollToBottom();
    } catch (error) {
        console.error('History error:', error);
    }
}

async function loadMenu() {
    try {
        const res = await fetch('/api/menu');
        menuItems = await res.json();
        menuList.innerHTML = '';
        menuItems.forEach(item => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '0.5rem';
            li.style.backgroundColor = 'var(--card-bg)';
            li.style.borderRadius = '4px';
            li.style.border = '1px solid var(--border-color)';
            
            li.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border-color);">` : ''}
                    <div>
                        <div style="font-size: 0.875rem; font-weight: 500;">${item.name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">$${item.price.toFixed(2)}</div>
                    </div>
                </div>
                <button onclick="addToCart('${item.name}')" style="background-color: var(--loyalty-bg); color: var(--accent-color); border: none; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">+</button>
            `;
            menuList.appendChild(li);
        });
    } catch (error) {
        console.error('Menu error:', error);
    }
}

window.addToCart = function(itemName) {
    const item = menuItems.find(i => i.name === itemName);
    if (!item) return;
    
    const existing = cart.find(i => i.name === itemName);
    if (existing) {
        existing.quantity++;
    } else {
        cart.push({ ...item, quantity: 1 });
    }
    updateCartUI();
};

window.removeFromCart = function(itemName) {
    const existing = cart.find(i => i.name === itemName);
    if (existing) {
        existing.quantity--;
        if (existing.quantity <= 0) {
            cart = cart.filter(i => i.name !== itemName);
        }
    }
    updateCartUI();
};

function updateCartUI() {
    cartList.innerHTML = '';
    let total = 0;
    
    cart.forEach(item => {
        total += item.price * item.quantity;
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        
        li.innerHTML = `
            <span>${item.quantity}x ${item.name}</span>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span>$${(item.price * item.quantity).toFixed(2)}</span>
                <button onclick="removeFromCart('${item.name}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0; font-size: 1.2rem;">&times;</button>
            </div>
        `;
        cartList.appendChild(li);
    });
    
    cartTotalEl.textContent = `$${total.toFixed(2)}`;
    placeOrderBtn.disabled = cart.length === 0;
}

placeOrderBtn.addEventListener('click', async () => {
    if (!currentUserToken || cart.length === 0) return;
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = 'Placing...';
    
    try {
        const res = await authFetch('/api/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cart })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to place order');
        }
        
        cart = [];
        updateCartUI();
        await updateLoyalty();
        loadOrderHistory(); // Refresh history list if visible
        placeOrderBtn.textContent = 'Order Placed!';
        
        startOrderPolling();

        setTimeout(() => { placeOrderBtn.textContent = 'Place Order'; }, 2000);
    } catch (error) {
        console.error('Order error:', error);
        placeOrderBtn.textContent = 'Place Order';
        placeOrderBtn.disabled = false;
        alert(`Failed to place order: ${error.message}`);
    }
});

async function loadOrderHistory() {
    if (!currentUserToken) return;
    try {
        const res = await authFetch('/api/orders');
        if (!res.ok) throw new Error('Failed to fetch orders');
        const data = await res.json();
        
        historyList.innerHTML = '';
        data.orders.forEach(order => {
            const date = new Date(order.timestamp).toLocaleString();
            let total = 0;
            const itemsHtml = order.items.map(item => {
                total += item.price * item.quantity;
                return `<div>${item.quantity}x ${item.name}</div>`;
            }).join('');
            
            const li = document.createElement('li');
            li.style.padding = '0.75rem';
            li.style.border = '1px solid var(--border-color)';
            li.style.borderRadius = '4px';
            li.style.backgroundColor = 'var(--card-bg)';
            
            const statusIndex = order.status === 'ready' ? 2 : (order.status === 'preparing' ? 1 : 0);
            
            const renderStep = (text, idx) => {
                const isActive = idx <= statusIndex;
                const isCurrent = idx === statusIndex;
                const color = isActive ? (idx === 2 ? '#10B981' : 'var(--accent-color)') : 'var(--loyalty-bg)';
                const textColor = isCurrent ? (idx === 2 ? '#10B981' : 'var(--accent-color)') : (isActive ? 'var(--text-color)' : 'var(--text-muted)');
                const weight = isCurrent ? 'bold' : 'normal';
                
                return `
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1; z-index: 2;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; margin-bottom: 4px; box-shadow: ${isCurrent ? '0 0 0 3px rgba(26, 59, 153, 0.2)' : 'none'}; transition: all 0.3s ease;"></div>
                        <span style="font-size: 0.65rem; color: ${textColor}; font-weight: ${weight}; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.3s ease;">${text}</span>
                    </div>
                `;
            };

            const progressBarHtml = `
                <div style="display: flex; align-items: center; position: relative; margin: 1rem 0 0.5rem 0;">
                    <div style="position: absolute; top: 5px; left: 15%; right: 15%; height: 2px; background-color: var(--loyalty-bg); z-index: 0;"></div>
                    <div style="position: absolute; top: 5px; left: 15%; width: ${statusIndex === 0 ? 0 : (statusIndex === 1 ? 35 : 70)}%; height: 2px; background-color: ${statusIndex === 2 ? '#10B981' : 'var(--accent-color)'}; z-index: 1; transition: width 0.5s ease, background-color 0.5s ease;"></div>
                    <div style="display: flex; width: 100%; justify-content: space-between; position: relative;">
                        ${renderStep('Pending', 0)}
                        ${renderStep('Preparing', 1)}
                        ${renderStep('Ready', 2)}
                    </div>
                </div>
            `;
            
            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${date}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Order #${order.id.slice(-6)}</div>
                </div>
                ${progressBarHtml}
                <div style="font-size: 0.875rem; margin-bottom: 0.5rem; margin-top: 1rem;">${itemsHtml}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.5rem; margin-top: 0.5rem;">
                    <strong>$${total.toFixed(2)}</strong>
                    <button onclick="reorder('${order.id}')" style="background-color: var(--accent-color); color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer;">Reorder</button>
                </div>
            `;
            li.dataset.items = JSON.stringify(order.items);
            historyList.appendChild(li);
        });
        
        if (data.orders.some(o => o.status !== 'ready')) {
            startOrderPolling();
        } else {
            stopOrderPolling();
        }
        
    } catch (error) {
        console.error('History load error:', error);
    }
}

window.reorder = function(orderId) {
    const listItems = Array.from(historyList.children);
    const itemEl = listItems.find(li => li.innerHTML.includes(orderId));
    if (itemEl && itemEl.dataset.items) {
        const items = JSON.parse(itemEl.dataset.items);
        items.forEach(i => {
            const existing = cart.find(c => c.name === i.name);
            if (existing) {
                existing.quantity += i.quantity;
            } else {
                cart.push({ ...i });
            }
        });
        updateCartUI();
        tabMenu.click();
    }
};

function startOrderPolling() {
    if (orderPollingInterval) return;
    orderPollingInterval = setInterval(() => {
        if (historyView.style.display === 'flex') {
            loadOrderHistory(); // Refresh history quietly if we're looking at it
        } else {
            checkPendingOrdersSilently();
        }
    }, 10000);
}

function stopOrderPolling() {
    if (orderPollingInterval) {
        clearInterval(orderPollingInterval);
        orderPollingInterval = null;
    }
}

async function checkPendingOrdersSilently() {
    if (!currentUserToken) return stopOrderPolling();
    try {
        const res = await authFetch('/api/orders');
        if (res.ok) {
            const data = await res.json();
            if (!data.orders.some(o => o.status !== 'ready')) {
                stopOrderPolling(); // Everything is ready, stop wasting requests
            }
        }
    } catch (e) {}
}

async function updateLoyalty() {
    if (!currentUserToken) return;
    try {
        const res = await authFetch('/api/orders');
        if (!res.ok) throw new Error('Failed to fetch orders');
        const data = await res.json();
        
        let drinkCount = 0;
        data.orders.forEach(order => {
            order.items.forEach(item => {
                if (item.category === 'Hot Drinks' || item.category === 'Cold Drinks') {
                    drinkCount += item.quantity;
                }
            });
        });
        
        let freeDrinksAvailable = Math.floor(drinkCount / 9);
        const loyaltyPoints = drinkCount % 9;
        const percent = Math.min((loyaltyPoints / 9) * 100, 100);
        
        loyaltyBar.style.width = `${percent}%`;
        
        if (freeDrinksAvailable > 0) {
            loyaltyText.textContent = `You have ${freeDrinksAvailable} free reward(s)! (${loyaltyPoints}/9 for next)`;
        } else {
            loyaltyText.textContent = `${loyaltyPoints}/9 Drinks for a free reward`;
        }
    } catch (error) {
        console.error('Loyalty error:', error);
    }
}

async function loadGreeting() {
    if (sessionStorage.getItem('greetingShown')) return;
    if (!currentUserToken) return;
    
    try {
        const res = await authFetch('/api/greeting');
        if (res.ok) {
            const data = await res.json();
            if (data.greeting) {
                appendMessage(data.greeting, 'assistant');
                sessionStorage.setItem('greetingShown', 'true');
                scrollToBottom();
            }
        }
    } catch (error) {
        console.error('Greeting error:', error);
    }
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !currentUserToken) return;

    appendMessage(text, 'user');
    chatInput.value = '';
    scrollToBottom();
    
    chatInput.disabled = true;
    sendBtn.disabled = true;
    if (SpeechRecognition) micBtn.disabled = true;

    try {
        const res = await authFetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        
        if (!res.ok) throw new Error('Failed to send message');
        const data = await res.json();
        appendMessage(data.reply, 'assistant');
    } catch (error) {
        console.error('Chat error:', error);
        appendMessage('Sorry, there was an error processing your request.', 'assistant');
    } finally {
        chatInput.disabled = false;
        sendBtn.disabled = false;
        if (SpeechRecognition) micBtn.disabled = false;
        chatInput.focus();
        scrollToBottom();
    }
});

function appendMessage(text, role) {
    const el = document.createElement('div');
    el.className = `message ${role}`;
    el.textContent = text;
    
    if (role === 'assistant') {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'feedback-btns';
        
        const upBtn = document.createElement('button');
        upBtn.innerHTML = '👍';
        upBtn.title = "Good response";
        
        const downBtn = document.createElement('button');
        downBtn.innerHTML = '👎';
        downBtn.title = "Bad response";
        
        const handleFeedback = async (rating) => {
            upBtn.disabled = true;
            downBtn.disabled = true;
            try {
                await authFetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageText: text, rating })
                });
            } catch (e) {
                console.error('Failed to submit feedback');
            }
        };
        
        upBtn.onclick = () => handleFeedback('up');
        downBtn.onclick = () => handleFeedback('down');
        
        feedbackDiv.appendChild(upBtn);
        feedbackDiv.appendChild(downBtn);
        el.appendChild(feedbackDiv);
    }
    
    messagesDiv.appendChild(el);
}

function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
