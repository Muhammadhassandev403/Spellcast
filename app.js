// SPELLCAST - FULL FRONTEND LOGIC
// ============================================

const API_URL = 'http://localhost:3000/api';

let userToken = localStorage.getItem('spellcast_token');
let currentChapterId = null;
let currentChapterNumber = 0;
let isPaid = false;
let currentDiceChoiceIndex = null;

// DOM refs
const heroScreen = document.getElementById('hero-screen');
const chapterScreen = document.getElementById('chapter-screen');
const libraryScreen = document.getElementById('library-screen');
const storyDetailScreen = document.getElementById('story-detail-screen');
const successScreen = document.getElementById('success-screen');
const scenarioInput = document.getElementById('scenario-input');
const startBtn = document.getElementById('start-adventure');
const loading = document.getElementById('loading');
const chapterImage = document.getElementById('chapter-image');
const chapterTitle = document.getElementById('chapter-title');
const chapterNarrative = document.getElementById('chapter-narrative');
const choicesContainer = document.getElementById('choices-container');
const paywallOverlay = document.getElementById('paywall-overlay');
const payBtn = document.getElementById('pay-button');
const restartBtn = document.getElementById('restart-button');
const continuePaidBtn = document.getElementById('continue-after-pay');
const chapterCounter = document.getElementById('chapter-counter');
const paidBadge = document.getElementById('paid-badge');
const transactionRefInput = document.getElementById('transaction-ref-input');
const paywallEmail = document.getElementById('paywall-email');
const verifyPaymentBtn = document.getElementById('verify-payment-btn');
const paymentStatus = document.getElementById('payment-status');
const closePaywallBtn = document.getElementById('close-paywall');

// ============================================
// INITIALIZATION
// ============================================

async function initUser() {
  if (!userToken) {
    userToken = crypto.randomUUID();
    localStorage.setItem('spellcast_token', userToken);
  }

  try {
    const res = await fetch(`${API_URL}/user/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    console.log('User data:', data);
    
    if (data && data.user) {
      isPaid = data.user.has_paid || false;
      updateUI(data.user);
      await checkResume();
      await checkPaymentStatus();
      return data.user;
    } else {
      throw new Error('No user data returned');
    }
  } catch (err) {
    console.error('Init user error:', err);
    const loading = document.getElementById('loading');
    if (loading) {
      loading.textContent = '❌ Connection error. Make sure backend is running!';
      loading.style.display = 'block';
    }
    return null;
  }
}

function updateUI(user) {
  if (user.has_paid) {
    paidBadge.style.display = 'inline';
    chapterCounter.textContent = 'Chapters: ∞ (Paid)';
  } else {
    paidBadge.style.display = 'none';
    const freeLeft = Math.max(0, 3 - user.chapters_used);
    chapterCounter.textContent = `Chapters: ${user.chapters_used}/3 free`;
  }
}

// ============================================
// RESUME CHECK
// ============================================

async function checkResume() {
  try {
    const res = await fetch(`${API_URL}/user/resume`, {
      headers: { 'x-user-token': userToken }
    });
    const data = await res.json();

    if (data.has_save) {
      const resumeSection = document.getElementById('resume-section');
      resumeSection.style.display = 'block';
      document.getElementById('resume-info').textContent = 
        `Chapter ${data.current_chapter.chapter_number}: ${data.current_chapter.title}`;
      
      document.getElementById('resume-btn').onclick = () => {
        renderChapter(data.current_chapter, data.current_chapter.image_url);
        heroScreen.classList.remove('active');
        chapterScreen.classList.add('active');
        resumeSection.style.display = 'none';
      };

      document.getElementById('new-game-btn').onclick = () => {
        if (confirm('Start a new adventure? Your old one will be archived.')) {
          resumeSection.style.display = 'none';
          fetch(`${API_URL}/user/save-progress`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-token': userToken
            },
            body: JSON.stringify({ chapterId: null })
          });
        }
      };
    }
  } catch (err) {
    console.log('Resume check failed:', err);
  }
}

// ============================================
// GENERATE STORY
// ============================================

startBtn.addEventListener('click', async () => {
  const scenario = scenarioInput.value.trim();
  if (!scenario) {
    alert('Describe your adventure first!');
    return;
  }

  loading.style.display = 'block';
  startBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/story/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({ scenario, chapterNumber: 1 })
    });

    if (res.status === 402) {
      showPaywall();
      loading.style.display = 'none';
      startBtn.disabled = false;
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      alert(data.message || 'Something went wrong');
      loading.style.display = 'none';
      startBtn.disabled = false;
      return;
    }

    currentChapterId = data.chapter.id;
    currentChapterNumber = data.chapter.chapter_number;
    renderChapter(data.chapter, data.image_url);
    updateUI({ chapters_used: data.chapter.chapter_number, has_paid: data.chapter.chapter_number > 3 });

    heroScreen.classList.remove('active');
    chapterScreen.classList.add('active');

  } catch (err) {
    alert('Error: ' + err.message);
  }

  loading.style.display = 'none';
  startBtn.disabled = false;
});

// ============================================
// RENDER CHAPTER
// ============================================

function renderChapter(chapter, imageUrl) {
  chapterImage.src = imageUrl || 'https://via.placeholder.com/768x512/1a1512/3a2f2a?text=⚔️+Spellcast';
  chapterTitle.textContent = `Chapter ${chapter.chapter_number}: ${chapter.title}`;
  chapterNarrative.textContent = chapter.narrative;

  choicesContainer.innerHTML = '';
  chapter.choices.forEach((choice, index) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML = `
      <strong>${choice.label}</strong>
      <br><span style="font-weight:normal;">${choice.description}</span>
      <br><span style="font-size:12px; color:#666;">🎲 Roll dice for this choice</span>
    `;
    btn.addEventListener('click', () => {
      showDiceSection(index);
    });
    choicesContainer.appendChild(btn);
  });
}

// ============================================
// DICE ROLL
// ============================================

function showDiceSection(choiceIndex) {
  currentDiceChoiceIndex = choiceIndex;
  document.getElementById('dice-section').style.display = 'block';
  document.getElementById('dice-result').textContent = '';
  document.getElementById('dice-outcome').style.display = 'none';
}

document.getElementById('roll-dice-btn').addEventListener('click', async () => {
  if (currentDiceChoiceIndex === null || !currentChapterId) return;

  const diceType = document.getElementById('dice-type').value;
  const maxVal = diceType === 'd20' ? 20 : diceType === 'd12' ? 12 : 6;
  const rollValue = Math.floor(Math.random() * maxVal) + 1;

  document.getElementById('dice-result').textContent = `🎲 ${rollValue}`;

  try {
    const res = await fetch(`${API_URL}/story/roll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({
        chapterId: currentChapterId,
        choiceIndex: currentDiceChoiceIndex,
        diceType,
        rollValue
      })
    });

    const data = await res.json();
    if (data.outcome) {
      const outcomeDiv = document.getElementById('dice-outcome');
      outcomeDiv.textContent = `⚔️ ${data.outcome}`;
      outcomeDiv.style.display = 'block';
      
      setTimeout(() => {
        makeChoice(currentDiceChoiceIndex, currentChapterId);
        document.getElementById('dice-section').style.display = 'none';
      }, 3000);
    }
  } catch (err) {
    alert('Dice roll error: ' + err.message);
  }
});

// ============================================
// MAKE CHOICE
// ============================================

async function makeChoice(choiceIndex, chapterId) {
  try {
    const res = await fetch(`${API_URL}/story/continue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({
        choiceIndex,
        previousChapterId: chapterId
      })
    });

    if (res.status === 402) {
      showPaywall();
      return;
    }

    const data = await res.json();
    if (data.error) {
      alert(data.message);
      return;
    }

    currentChapterId = data.chapter.id;
    currentChapterNumber = data.chapter.chapter_number;
    renderChapter(data.chapter, data.chapter.image_url);

    const user = await fetch(`${API_URL}/user/status`, {
      headers: { 'x-user-token': userToken }
    }).then(r => r.json());

    updateUI({ chapters_used: user.chapters_used, has_paid: user.has_paid });

  } catch (err) {
    alert('Error continuing story: ' + err.message);
  }
}

// ============================================
// PAYWALL
// ============================================

function showPaywall() {
  paywallOverlay.style.display = 'block';
  paymentStatus.style.display = 'none';
  transactionRefInput.value = '';
  paywallEmail.value = '';
}

closePaywallBtn.addEventListener('click', () => {
  paywallOverlay.style.display = 'none';
});

verifyPaymentBtn.addEventListener('click', async () => {
  const ref = transactionRefInput.value.trim();
  const email = paywallEmail.value.trim();

  if (!ref || ref.length < 5) {
    showPaymentStatus('⚠️ Please enter a valid transaction reference', '#ff6b6b');
    return;
  }

  if (!email || !email.includes('@')) {
    showPaymentStatus('⚠️ Please enter a valid email address', '#ff6b6b');
    return;
  }

  verifyPaymentBtn.disabled = true;
  verifyPaymentBtn.textContent = '⏳ Verifying...';

  try {
    const res = await fetch(`${API_URL}/payment/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({ transactionRef: ref, email })
    });

    const data = await res.json();

    if (data.success) {
      if (data.already_verified || data.verified) {
        showPaymentStatus('✅ Payment verified! You now have unlimited chapters! 🎉', '#51cf66');
        await initUser();
        isPaid = true;
        paidBadge.style.display = 'inline';
        chapterCounter.textContent = 'Chapters: ∞ (Paid)';
        
        setTimeout(() => {
          paywallOverlay.style.display = 'none';
        }, 2000);
      } else if (data.pending) {
        showPaymentStatus(`📝 ${data.message}`, '#fcc419');
        verifyPaymentBtn.textContent = '✅ Sent for Verification';
        verifyPaymentBtn.disabled = true;
      }
    } else {
      showPaymentStatus('❌ ' + (data.error || 'Verification failed'), '#ff6b6b');
      verifyPaymentBtn.disabled = false;
      verifyPaymentBtn.textContent = '✅ Verify Payment';
    }
  } catch (err) {
    showPaymentStatus('❌ Error: ' + err.message, '#ff6b6b');
    verifyPaymentBtn.disabled = false;
    verifyPaymentBtn.textContent = '✅ Verify Payment';
  }
});

function showPaymentStatus(message, color) {
  paymentStatus.style.display = 'block';
  paymentStatus.textContent = message;
  paymentStatus.style.background = color + '15';
  paymentStatus.style.color = color;
  paymentStatus.style.border = `1px solid ${color}`;
}

document.getElementById('restart-from-paywall').addEventListener('click', () => {
  if (confirm('Start a new adventure? Your progress will be reset.')) {
    localStorage.removeItem('spellcast_token');
    userToken = crypto.randomUUID();
    localStorage.setItem('spellcast_token', userToken);
    paywallOverlay.style.display = 'none';
    chapterScreen.classList.remove('active');
    heroScreen.classList.add('active');
    scenarioInput.value = '';
    initUser();
  }
});

// ============================================
// CHECK PAYMENT STATUS
// ============================================

async function checkPaymentStatus() {
  try {
    const res = await fetch(`${API_URL}/payment/status`, {
      headers: { 'x-user-token': userToken }
    });
    const data = await res.json();
    
    if (data.has_payment && data.verified) {
      isPaid = true;
      paidBadge.style.display = 'inline';
      chapterCounter.textContent = 'Chapters: ∞ (Paid)';
      paywallOverlay.style.display = 'none';
    }
    return data;
  } catch (err) {
    return null;
  }
}

// ============================================
// EDIT CHAPTER
// ============================================

let editingChapterId = null;

document.getElementById('edit-chapter-btn').addEventListener('click', async () => {
  if (!currentChapterId) return;
  
  const res = await fetch(`${API_URL}/edit/history`, {
    headers: { 'x-user-token': userToken }
  });
  const data = await res.json();
  const current = data.chapters.find(c => c.id === currentChapterId);
  
  if (!current) return;

  editingChapterId = currentChapterId;
  document.getElementById('edit-title').value = current.title;
  document.getElementById('edit-narrative').value = current.narrative;
  document.getElementById('edit-choices').value = JSON.stringify(current.choices, null, 2);
  document.getElementById('edit-modal').style.display = 'block';
});

document.getElementById('cancel-edit-btn').addEventListener('click', () => {
  document.getElementById('edit-modal').style.display = 'none';
});

document.getElementById('save-edit-btn').addEventListener('click', async () => {
  const title = document.getElementById('edit-title').value.trim();
  const narrative = document.getElementById('edit-narrative').value.trim();
  let choices;
  
  try {
    choices = JSON.parse(document.getElementById('edit-choices').value);
  } catch (e) {
    alert('Invalid JSON in choices.');
    return;
  }

  if (!title || !narrative || !choices) {
    alert('All fields are required!');
    return;
  }

  document.getElementById('edit-loading').style.display = 'block';
  document.getElementById('save-edit-btn').disabled = true;

  try {
    const res = await fetch(`${API_URL}/edit/edit-chapter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({
        chapterId: editingChapterId,
        newTitle: title,
        newNarrative: narrative,
        newChoices: choices,
        regenerateFuture: true
      })
    });

    const data = await res.json();
    
    if (data.branch_id) {
      alert(`✅ Chapter edited! ${data.regenerated_chapters?.length || 0} future chapters regenerated.`);
      if (data.regenerated_chapters?.length > 0) {
        renderChapter(data.regenerated_chapters[0], data.regenerated_chapters[0].image_url);
      }
      document.getElementById('edit-modal').style.display = 'none';
      await initUser();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }

  document.getElementById('edit-loading').style.display = 'none';
  document.getElementById('save-edit-btn').disabled = false;
});

// ============================================
// HISTORY & BRANCHES
// ============================================

document.getElementById('view-history-btn').addEventListener('click', async () => {
  const res = await fetch(`${API_URL}/edit/history`, {
    headers: { 'x-user-token': userToken }
  });
  const data = await res.json();
  
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '';
  
  data.chapters.forEach(ch => {
    const div = document.createElement('div');
    div.style.cssText = `
      padding: 12px; 
      border-bottom: 1px solid #2a1f1a; 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      ${ch.is_edited ? 'border-left: 3px solid #f0c060; padding-left: 15px;' : ''}
    `;
    div.innerHTML = `
      <div>
        <strong style="color:${ch.is_edited ? '#f0c060' : '#e0d6c8'}">
          Chapter ${ch.chapter_number}: ${ch.title}
        </strong>
        ${ch.is_edited ? ' <span style="color:#f0c060;font-size:12px;">✏️ Edited</span>' : ''}
        <div style="font-size:12px; color:#666; margin-top:3px;">
          ${ch.narrative.substring(0, 100)}...
        </div>
      </div>
      <button class="jump-to-chapter" data-id="${ch.id}" style="background:transparent; border:1px solid #3a2f2a; color:#888; padding:5px 12px; font-size:12px;">Jump</button>
    `;
    historyList.appendChild(div);
  });

  document.querySelectorAll('.jump-to-chapter').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const chapter = data.chapters.find(c => c.id === id);
      if (chapter) {
        renderChapter(chapter, chapter.image_url);
        document.getElementById('history-modal').style.display = 'none';
      }
    });
  });

  const branchesList = document.getElementById('branches-list');
  branchesList.innerHTML = '';
  
  data.branches.forEach(branch => {
    const isActive = branch.is_active;
    const div = document.createElement('div');
    div.style.cssText = `
      padding: 12px; 
      border: 1px solid ${isActive ? '#f0c060' : '#2a1f1a'}; 
      border-radius: 6px; 
      margin-bottom: 8px;
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      background: ${isActive ? 'rgba(240,192,96,0.05)' : 'transparent'};
    `;
    div.innerHTML = `
      <div>
        <strong style="color:${isActive ? '#f0c060' : '#888'}">${branch.branch_name}</strong>
        ${isActive ? ' <span style="color:#f0c060;font-size:12px;">● Active</span>' : ''}
        <div style="font-size:12px; color:#555; margin-top:3px;">${new Date(branch.created_at).toLocaleString()}</div>
      </div>
      ${!isActive ? `<button class="switch-branch" data-id="${branch.id}" style="background:transparent; border:1px solid #7a4a2a; color:#e0d6c8; padding:5px 12px; font-size:12px;">Switch</button>` : ''}
    `;
    branchesList.appendChild(div);
  });

  document.querySelectorAll('.switch-branch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const branchId = parseInt(btn.dataset.id);
      const res = await fetch(`${API_URL}/edit/switch-branch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-token': userToken
        },
        body: JSON.stringify({ branchId })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Switched to branch! Reloading...');
        window.location.reload();
      }
    });
  });

  document.getElementById('history-modal').style.display = 'block';
});

document.getElementById('close-history-btn').addEventListener('click', () => {
  document.getElementById('history-modal').style.display = 'none';
});

document.getElementById('branches-btn').addEventListener('click', () => {
  document.getElementById('view-history-btn').click();
});

// ============================================
// SHARE
// ============================================

document.getElementById('share-btn').addEventListener('click', async () => {
  if (!currentChapterId) return;

  const res = await fetch(`${API_URL}/share/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': userToken
    },
    body: JSON.stringify({ chapterId: currentChapterId })
  });

  const data = await res.json();
  if (data.share_url) {
    const shareResult = document.getElementById('share-result');
    shareResult.style.display = 'block';
    document.getElementById('share-link-input').value = data.share_url;
  }
});

document.getElementById('copy-share-btn').addEventListener('click', () => {
  const input = document.getElementById('share-link-input');
  input.select();
  navigator.clipboard?.writeText(input.value);
  alert('Link copied!');
});

// ============================================
// EXPORT
// ============================================

document.getElementById('export-pdf-btn').addEventListener('click', async () => {
  try {
    const res = await fetch(`${API_URL}/export/pdf`, {
      headers: { 'x-user-token': userToken }
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spellcast-story-${Date.now()}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error exporting PDF: ' + err.message);
  }
});

document.getElementById('export-epub-btn').addEventListener('click', async () => {
  try {
    const res = await fetch(`${API_URL}/export/epub`, {
      headers: { 'x-user-token': userToken }
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spellcast-ebook-${Date.now()}.zip`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error exporting EPUB: ' + err.message);
  }
});

// ============================================
// LIBRARY
// ============================================

let libraryOffset = 0;
let libraryTotal = 0;
const LIBRARY_LIMIT = 20;

document.getElementById('nav-library').addEventListener('click', showLibrary);
document.getElementById('nav-hero').addEventListener('click', () => {
  libraryScreen.classList.remove('active');
  storyDetailScreen.classList.remove('active');
  if (currentChapterId) {
    chapterScreen.classList.add('active');
  } else {
    heroScreen.classList.add('active');
  }
});

async function showLibrary() {
  chapterScreen.classList.remove('active');
  heroScreen.classList.remove('active');
  storyDetailScreen.classList.remove('active');
  libraryScreen.classList.add('active');
  libraryOffset = 0;
  await loadLibraryStories();
}

async function loadLibraryStories(reset = true) {
  if (reset) {
    libraryOffset = 0;
    document.getElementById('library-grid').innerHTML = '';
  }

  const genre = document.getElementById('library-genre-filter').value;
  const sort = document.getElementById('library-sort').value;

  document.getElementById('library-loading').style.display = 'block';

  try {
    const res = await fetch(
      `${API_URL}/library/stories?genre=${genre}&sort=${sort}&limit=${LIBRARY_LIMIT}&offset=${libraryOffset}`
    );
    const data = await res.json();

    if (reset) {
      document.getElementById('library-grid').innerHTML = '';
      libraryTotal = data.total;
    }

    data.stories.forEach(story => {
      const card = document.createElement('div');
      card.className = 'story-card';
      card.innerHTML = `
        ${story.cover_image ? `<img src="${story.cover_image}" style="width:100%; height:150px; object-fit:cover; border-radius:4px; margin-bottom:10px;">` : ''}
        <h3 style="color:#f0c060; font-size:16px;">${story.title}</h3>
        <p style="color:#888; font-size:13px; margin:5px 0;">${story.description?.substring(0, 100)}...</p>
        <div style="display:flex; gap:15px; font-size:12px; color:#666; margin-top:10px;">
          <span>❤️ ${story.upvotes || 0}</span>
          <span>👁️ ${story.views || 0}</span>
          <span>📖 ${story.chapter_count || 0} chapters</span>
          <span style="color:#7a4a2a;">${story.genre || 'Fantasy'}</span>
        </div>
      `;
      card.addEventListener('click', () => viewLibraryStory(story.id));
      document.getElementById('library-grid').appendChild(card);
    });

    document.getElementById('library-loading').style.display = 'none';
    document.getElementById('library-load-more').style.display = 
      data.stories.length < data.total ? 'block' : 'none';

  } catch (err) {
    document.getElementById('library-loading').style.display = 'none';
    console.error('Library error:', err);
  }
}

document.getElementById('library-load-more').addEventListener('click', () => {
  libraryOffset += LIBRARY_LIMIT;
  loadLibraryStories(false);
});

document.getElementById('library-genre-filter').addEventListener('change', showLibrary);
document.getElementById('library-sort').addEventListener('change', showLibrary);

// ============================================
// VIEW LIBRARY STORY
// ============================================

async function viewLibraryStory(storyId) {
  libraryScreen.classList.remove('active');
  storyDetailScreen.classList.add('active');

  const res = await fetch(`${API_URL}/library/story/${storyId}`, {
    headers: { 'x-user-token': userToken }
  });
  const data = await res.json();

  const content = document.getElementById('story-detail-content');
  
  let chaptersHtml = '';
  if (data.story.chapters && data.story.chapters.length > 0) {
    chaptersHtml = data.story.chapters.map(ch => `
      <div style="background:#0a0a12; padding:15px; border-radius:8px; margin-bottom:15px; border-left: 3px solid #3a2f2a;">
        <h4 style="color:#f0c060; font-size:15px;">Chapter ${ch.chapter_number}: ${ch.title}</h4>
        <p style="color:#aaa; font-size:14px; line-height:1.6;">${ch.narrative}</p>
        ${ch.image_url ? `<img src="${ch.image_url}" style="width:100%; max-height:200px; object-fit:cover; border-radius:4px; margin-top:10px;">` : ''}
      </div>
    `).join('');
  }

  content.innerHTML = `
    <div style="background:#1a1512; border-radius:12px; padding:25px; border:1px solid #2a1f1a;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h1 style="color:#f0c060; font-size:28px;">${data.story.title}</h1>
          <p style="color:#888; font-size:14px;">${data.story.genre} • ${data.story.chapter_count} chapters</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button id="upvote-btn" style="background:${data.story.hasUpvoted ? '#f0c060' : 'transparent'}; border:1px solid ${data.story.hasUpvoted ? '#f0c060' : '#3a2f2a'}; color:${data.story.hasUpvoted ? '#0a0a12' : '#888'}; padding:10px 20px; border-radius:4px; cursor:pointer;">
            ❤️ ${data.story.upvotes || 0}
          </button>
          <button id="library-share-btn" style="background:transparent; border:1px solid #3a2f2a; color:#888; padding:10px 20px; border-radius:4px; cursor:pointer;">🔗 Share</button>
        </div>
      </div>
      <p style="color:#aaa; font-size:16px; margin:20px 0; line-height:1.8;">${data.story.description}</p>
      <div style="border-top:1px solid #2a1f1a; padding-top:20px; margin-top:20px;">
        <h3 style="color:#f0c060;">📖 Chapters</h3>
        ${chaptersHtml}
      </div>
      <div style="border-top:1px solid #2a1f1a; padding-top:20px; margin-top:20px;">
        <h3 style="color:#f0c060;">💬 Comments</h3>
        <div id="library-comments">
          ${data.story.comments?.map(c => `
            <div style="background:#0a0a12; padding:10px; border-radius:4px; margin-bottom:8px;">
              <strong style="color:#888; font-size:12px;">${c.user_token?.substring(0, 8) || 'Anonymous'}</strong>
              <p style="color:#aaa; font-size:14px; margin:4px 0;">${c.comment}</p>
              <span style="color:#555; font-size:11px;">${new Date(c.created_at).toLocaleString()}</span>
            </div>
          `).join('') || '<p style="color:#666; font-size:14px;">No comments yet.</p>'}
        </div>
        <div style="display:flex; gap:10px; margin-top:15px;">
          <input type="text" id="comment-input" placeholder="Write a comment..." style="flex:1; padding:10px; background:#0a0a12; border:1px solid #2a1f1a; color:#e0d6c8; border-radius:4px;">
          <button id="comment-submit-btn" style="background:#7a4a2a; color:#f0e0d0; padding:10px 20px; border:none; border-radius:4px; cursor:pointer;">Post</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('upvote-btn').addEventListener('click', async () => {
    const res = await fetch(`${API_URL}/library/upvote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({ storyId })
    });
    const data = await res.json();
    viewLibraryStory(storyId);
  });

  document.getElementById('library-share-btn').addEventListener('click', () => {
    const url = `${window.location.origin}/library/${storyId}`;
    navigator.clipboard?.writeText(url);
    alert('📋 Link copied!');
  });

  document.getElementById('comment-submit-btn').addEventListener('click', async () => {
    const input = document.getElementById('comment-input');
    const comment = input.value.trim();
    if (!comment) return;

    const res = await fetch(`${API_URL}/library/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({ storyId, comment })
    });

    if (res.ok) {
      input.value = '';
      viewLibraryStory(storyId);
    }
  });
}

document.getElementById('back-to-library').addEventListener('click', () => {
  storyDetailScreen.classList.remove('active');
  showLibrary();
});

// ============================================
// PUBLISH STORY
// ============================================

document.getElementById('publish-my-story-btn').addEventListener('click', () => {
  document.getElementById('publish-title').value = 
    document.getElementById('chapter-title')?.textContent?.replace(/^Chapter \d+: /, '') || 'My Adventure';
  document.getElementById('publish-description').value = 
    document.getElementById('chapter-narrative')?.textContent?.substring(0, 200) || '';
  document.getElementById('publish-modal').style.display = 'block';
});

document.getElementById('cancel-publish-btn').addEventListener('click', () => {
  document.getElementById('publish-modal').style.display = 'none';
});

document.getElementById('confirm-publish-btn').addEventListener('click', async () => {
  const title = document.getElementById('publish-title').value.trim();
  const description = document.getElementById('publish-description').value.trim();
  const genre = document.getElementById('publish-genre').value;

  if (!title) {
    alert('Please enter a title');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/library/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': userToken
      },
      body: JSON.stringify({ branchId: null, title, description, genre })
    });

    const data = await res.json();
    if (data.story_id) {
      alert(`📖 Published! View it at: ${data.share_url}`);
      document.getElementById('publish-modal').style.display = 'none';
      showLibrary();
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// ============================================
// LOAD GENRES
// ============================================

document.getElementById('nav-library').addEventListener('click', async () => {
  const res = await fetch(`${API_URL}/library/genres`);
  const genres = await res.json();
  const select = document.getElementById('library-genre-filter');
  select.innerHTML = genres.map(g => `<option value="${g}">${g}</option>`).join('');
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('edit-modal').style.display = 'none';
    document.getElementById('history-modal').style.display = 'none';
    document.getElementById('publish-modal').style.display = 'none';
  }
});

// ============================================
// START APP
// ============================================

initUser().then(() => {
  console.log('⚔️ Spellcast loaded. May your legend grow!');
});