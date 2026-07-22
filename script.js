/* =========================================================
   Wavelength Audio Engine — Vanilla JS Spotify Clone Player
   ========================================================= */
(function () {
  "use strict";

  /* ---------- DOM Handles ---------- */
  const audio          = document.getElementById("audio-player");

  const playPauseBtn   = document.getElementById("play-pause-btn");
  const prevBtn        = document.getElementById("prev-btn");
  const nextBtn        = document.getElementById("next-btn");
  const shuffleBtn     = document.getElementById("shuffle-btn");
  const repeatBtn      = document.getElementById("repeat-btn");
  const likeBtn        = document.getElementById("like-btn");
  const queueBtn       = document.getElementById("queue-btn");
  const muteBtn        = document.getElementById("mute-btn");

  const seekSlider     = document.getElementById("seek-slider");
  const currentTimeEl  = document.getElementById("current-time");
  const durationEl     = document.getElementById("duration-time");
  const volumeSlider   = document.getElementById("volume-slider");

  const playerCover    = document.getElementById("player-cover");
  const playerTitle    = document.getElementById("player-title");
  const playerArtist   = document.getElementById("player-artist");
  const equalizerBar   = document.getElementById("equalizer-bar");

  const heroPlayBtn    = document.getElementById("hero-play-btn");
  const searchInput    = document.getElementById("search-input");
  const localFileInput = document.getElementById("local-file-input");

  /* SVG Icons */
  const ICON_PLAY  = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  /* ---------- Playlist Data State ---------- */
  let fullPlaylist = [];
  let currentActivePlaylist = [];
  let activeCategory = "all";
  let likedTracks = loadLiked();

  function buildPlaylistFromDOM() {
    const cardEls = Array.from(document.querySelectorAll(".playlist-row:not(#favorite-songs-section) .card[data-src]"));
    
    fullPlaylist = [];
    const seenSrcs = new Set();

    cardEls.forEach((el, index) => {
      const src = el.dataset.src;
      if (seenSrcs.has(src)) return;
      seenSrcs.add(src);

      const title = el.dataset.title || "Unknown Title";
      const artist = el.dataset.artist || "Unknown Artist";
      const categories = (el.dataset.category || "all").split(",");
      const cover = el.querySelector("img")?.src || "pictures/505.jpg";

      const trackObj = {
        id: index,
        title,
        artist,
        src,
        cover,
        categories,
        el
      };

      fullPlaylist.push(trackObj);
    });

    filterActivePlaylist(activeCategory);
    updateFavoriteStates();
  }

  function filterActivePlaylist(category) {
    activeCategory = category;
    if (category === "all") {
      currentActivePlaylist = [...fullPlaylist];
    } else if (category === "favorites") {
      currentActivePlaylist = fullPlaylist.filter(t => likedTracks.has(t.src));
    } else {
      currentActivePlaylist = fullPlaylist.filter(t => t.categories.includes(category));
    }

    if (currentActivePlaylist.length === 0 && category !== "favorites") {
      currentActivePlaylist = [...fullPlaylist];
    }
  }

  /* ---------- State Variables ---------- */
  let currentIndex = 0;
  let isShuffled = false;
  let shuffleOrder = [];
  let shufflePos = 0;
  let repeatMode = "off"; // "off" -> "all" -> "one"
  let isSeeking = false;

  /* ---------- Helpers ---------- */
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0 || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function loadLiked() {
    try {
      return new Set(JSON.parse(localStorage.getItem("wavelength_liked") || "[]"));
    } catch {
      return new Set();
    }
  }

  function saveLiked() {
    try {
      localStorage.setItem("wavelength_liked", JSON.stringify([...likedTracks]));
    } catch { /* storage fallback */ }
  }

  function updateSliderBackground(slider, current, max) {
    if (!slider) return;
    const percent = Math.min(100, Math.max(0, (current / (max || 1)) * 100));
    slider.style.background = `linear-gradient(to right, var(--accent, #1ED760) ${percent}%, #3a423a ${percent}%)`;
  }

  function buildShuffleOrder() {
    shuffleOrder = currentActivePlaylist.map((_, i) => i);
    for (let i = shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
    }
    shufflePos = shuffleOrder.indexOf(currentIndex);
    if (shufflePos === -1) shufflePos = 0;
  }

  /* ---------- Core Track Loader ---------- */
  function loadTrack(index, autoplay = true) {
    if (!currentActivePlaylist.length) return;

    if (index < 0) index = currentActivePlaylist.length - 1;
    if (index >= currentActivePlaylist.length) index = 0;

    currentIndex = index;
    const track = currentActivePlaylist[currentIndex];
    if (!track) return;

    if (audio.getAttribute("src") !== track.src) {
      audio.src = track.src;
    }

    playerTitle.textContent = track.title;
    playerArtist.textContent = track.artist;
    if (track.cover) playerCover.src = track.cover;

    highlightPlayingCards();
    updateLikeButton();
    renderQueuePanel();

    if (autoplay) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Autoplay blocked or playback error:", err);
          setPlayPauseIcon(false);
        });
      }
    }
  }

  /* Sync playing state on cards */
  function highlightPlayingCards() {
    const track = currentActivePlaylist[currentIndex];
    const currentSrc = track ? track.src : "";
    const isPlaying = !audio.paused;

    const allCards = document.querySelectorAll(".card[data-src]");
    allCards.forEach((card) => {
      const cardSrc = card.dataset.src;
      const playBtn = card.querySelector(".card-play");

      if (cardSrc === currentSrc) {
        card.classList.add("is-playing");
        if (playBtn) playBtn.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
      } else {
        card.classList.remove("is-playing");
        if (playBtn) playBtn.innerHTML = ICON_PLAY;
      }
    });
  }

  /* ---------- Favorites & Red Heart Sync ---------- */
  function updateFavoriteStates() {
    // Sync heart buttons on all cards
    const allCards = document.querySelectorAll(".card[data-src]");
    allCards.forEach((card) => {
      const cardSrc = card.dataset.src;
      const favBtn = card.querySelector(".card-fav-btn");
      if (favBtn) {
        const isFav = likedTracks.has(cardSrc);
        favBtn.classList.toggle("is-fav", isFav);
      }
    });

    updateLikeButton();
    renderFavoritesSection();
  }

  function renderFavoritesSection() {
    const favGrid = document.getElementById("favorites-card-grid");
    const emptyMsg = document.getElementById("empty-fav-message");
    const favBadge = document.getElementById("fav-count-badge");
    if (!favGrid) return;

    favGrid.innerHTML = "";
    const favTracks = fullPlaylist.filter(t => likedTracks.has(t.src));

    if (favBadge) favBadge.textContent = `${favTracks.length} Songs`;

    if (favTracks.length === 0) {
      if (emptyMsg) emptyMsg.style.display = "block";
    } else {
      if (emptyMsg) emptyMsg.style.display = "none";

      favTracks.forEach((t) => {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.title = t.title;
        card.dataset.artist = t.artist;
        card.dataset.src = t.src;
        card.dataset.category = "favorites";

        card.innerHTML = `
          <div class="card-art">
            <img src="${t.cover}" alt="${t.title}">
            <button class="card-fav-btn is-fav" aria-label="Favorite ${t.title}">
              <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
            <button class="card-play" aria-label="Play ${t.title}">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
          <h3 class="card-title">${t.title}</h3>
          <p class="card-sub">${t.artist}</p>`;

        favGrid.appendChild(card);
      });
    }

    highlightPlayingCards();
  }

  function toggleFavorite(src) {
    if (!src) return;
    if (likedTracks.has(src)) {
      likedTracks.delete(src);
    } else {
      likedTracks.add(src);
    }
    saveLiked();
    updateFavoriteStates();

    if (activeCategory === "favorites") {
      filterActivePlaylist("favorites");
    }
  }

  /* ---------- Play / Pause Engine ---------- */
  function setPlayPauseIcon(playing) {
    playPauseBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    playPauseBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    playPauseBtn.classList.toggle("is-playing", playing);

    if (equalizerBar) {
      equalizerBar.classList.toggle("playing", playing);
    }

    if (heroPlayBtn) {
      heroPlayBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    }

    highlightPlayingCards();
  }

  function togglePlayPause() {
    if (!audio.src || !currentActivePlaylist.length) {
      if (currentActivePlaylist.length) loadTrack(0, true);
      return;
    }
    if (audio.paused) {
      audio.play().catch((err) => console.warn("Playback failed:", err));
    } else {
      audio.pause();
    }
  }

  audio.addEventListener("play", () => setPlayPauseIcon(true));
  audio.addEventListener("pause", () => setPlayPauseIcon(false));

  /* ---------- Next & Previous ---------- */
  function getNextIndex() {
    if (!currentActivePlaylist.length) return -1;
    if (isShuffled) {
      shufflePos = (shufflePos + 1) % shuffleOrder.length;
      return shuffleOrder[shufflePos];
    }
    return (currentIndex + 1) % currentActivePlaylist.length;
  }

  function getPrevIndex() {
    if (!currentActivePlaylist.length) return -1;
    if (isShuffled) {
      shufflePos = (shufflePos - 1 + shuffleOrder.length) % shuffleOrder.length;
      return shuffleOrder[shufflePos];
    }
    return (currentIndex - 1 + currentActivePlaylist.length) % currentActivePlaylist.length;
  }

  function playNext() { loadTrack(getNextIndex(), true); }
  function playPrev() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    loadTrack(getPrevIndex(), true);
  }

  audio.addEventListener("ended", () => {
    if (repeatMode === "one") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    if (!isShuffled && repeatMode === "off" && currentIndex === currentActivePlaylist.length - 1) {
      setPlayPauseIcon(false);
      return;
    }
    playNext();
  });

  /* ---------- Shuffle & Repeat ---------- */
  function toggleShuffle() {
    isShuffled = !isShuffled;
    shuffleBtn.classList.toggle("active", isShuffled);
    if (isShuffled) buildShuffleOrder();
  }

  function cycleRepeat() {
    repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    repeatBtn.classList.toggle("active", repeatMode !== "off");
    repeatBtn.title = repeatMode === "one" ? "Repeat Track" : repeatMode === "all" ? "Repeat Playlist" : "Repeat Off";
  }

  /* ---------- Timeline & Seek ---------- */
  function updateDuration() {
    if (audio.duration && !isNaN(audio.duration)) {
      durationEl.textContent = formatTime(audio.duration);
      seekSlider.max = Math.floor(audio.duration);
      updateSliderBackground(seekSlider, audio.currentTime, audio.duration);
    }
  }

  audio.addEventListener("loadedmetadata", updateDuration);
  audio.addEventListener("durationchange", updateDuration);

  audio.addEventListener("timeupdate", () => {
    if (isSeeking) return;
    currentTimeEl.textContent = formatTime(audio.currentTime);
    seekSlider.value = Math.floor(audio.currentTime);
    updateSliderBackground(seekSlider, audio.currentTime, audio.duration || 100);
  });

  seekSlider.addEventListener("input", () => {
    isSeeking = true;
    currentTimeEl.textContent = formatTime(Number(seekSlider.value));
    updateSliderBackground(seekSlider, Number(seekSlider.value), Number(seekSlider.max));
  });

  seekSlider.addEventListener("change", () => {
    audio.currentTime = Number(seekSlider.value);
    isSeeking = false;
  });

  /* ---------- Volume ---------- */
  let lastVolume = 0.7;
  audio.volume = lastVolume;
  updateSliderBackground(volumeSlider, 70, 100);

  volumeSlider.addEventListener("input", () => {
    const v = Number(volumeSlider.value) / 100;
    audio.volume = v;
    audio.muted = (v === 0);
    updateMuteIcon();
    updateSliderBackground(volumeSlider, Number(volumeSlider.value), 100);
  });

  function updateMuteIcon() {
    muteBtn.classList.toggle("active", audio.muted || audio.volume === 0);
  }

  muteBtn.addEventListener("click", () => {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      audio.volume = lastVolume || 0.7;
      volumeSlider.value = Math.round(audio.volume * 100);
    } else {
      lastVolume = audio.volume;
      audio.muted = true;
      volumeSlider.value = 0;
    }
    updateMuteIcon();
    updateSliderBackground(volumeSlider, Number(volumeSlider.value), 100);
  });

  /* ---------- Like Button Handler ---------- */
  function updateLikeButton() {
    const track = currentActivePlaylist[currentIndex];
    const liked = track && likedTracks.has(track.src);
    likeBtn.classList.toggle("liked", !!liked);
  }

  likeBtn.addEventListener("click", () => {
    const track = currentActivePlaylist[currentIndex];
    if (track) toggleFavorite(track.src);
  });

  /* ---------- Queue Panel Drawer ---------- */
  const queuePanel = document.createElement("div");
  queuePanel.className = "queue-panel";
  queuePanel.innerHTML = '<h4>Next Up</h4><div class="queue-list"></div>';
  document.body.appendChild(queuePanel);
  const queueListEl = queuePanel.querySelector(".queue-list");

  function renderQueuePanel() {
    queueListEl.innerHTML = "";
    const order = isShuffled ? shuffleOrder : currentActivePlaylist.map((_, i) => i);
    const startPos = isShuffled ? shufflePos : currentIndex;

    for (let step = 0; step < Math.min(12, order.length); step++) {
      const pos = (startPos + step) % order.length;
      const idx = order[pos];
      const t = currentActivePlaylist[idx];
      if (!t) continue;

      const row = document.createElement("div");
      row.className = "queue-item" + (idx === currentIndex ? " is-current" : "");
      row.innerHTML = `
        <img src="${t.cover}" alt="">
        <div class="qi-info">
          <span class="qi-title">${t.title}</span>
          <span class="qi-artist">${t.artist}</span>
        </div>`;
      row.addEventListener("click", () => loadTrack(idx, true));
      queueListEl.appendChild(row);
    }
  }

  queueBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    queuePanel.classList.toggle("open");
    if (queuePanel.classList.contains("open")) renderQueuePanel();
  });

  document.addEventListener("click", (e) => {
    if (!queuePanel.contains(e.target) && e.target !== queueBtn && !queueBtn.contains(e.target)) {
      queuePanel.classList.remove("open");
    }
  });

  /* ---------- Transport Listeners ---------- */
  playPauseBtn.addEventListener("click", togglePlayPause);
  nextBtn.addEventListener("click", playNext);
  prevBtn.addEventListener("click", playPrev);
  shuffleBtn.addEventListener("click", toggleShuffle);
  repeatBtn.addEventListener("click", cycleRepeat);

  /* ---------- Favorite Heart Click Delegation ---------- */
  document.addEventListener("click", (e) => {
    const favBtn = e.target.closest(".card-fav-btn");
    if (favBtn) {
      e.stopPropagation();
      const card = favBtn.closest(".card[data-src]");
      if (card && card.dataset.src) {
        toggleFavorite(card.dataset.src);
      }
      return;
    }

    const card = e.target.closest(".card[data-src]");
    if (!card) return;

    const src = card.dataset.src;
    const matchIdx = currentActivePlaylist.findIndex(t => t.src === src);

    if (matchIdx !== -1) {
      if (matchIdx === currentIndex) {
        togglePlayPause();
      } else {
        loadTrack(matchIdx, true);
      }
    } else {
      const fullIdx = fullPlaylist.findIndex(t => t.src === src);
      if (fullIdx !== -1) {
        filterActivePlaylist("all");
        loadTrack(fullIdx, true);
      }
    }
  });

  /* Hero Button Handler */
  if (heroPlayBtn) {
    heroPlayBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const heroSrc = heroPlayBtn.dataset.src;
      const matchIdx = currentActivePlaylist.findIndex(t => t.src === heroSrc);
      if (matchIdx !== -1) {
        if (currentIndex === matchIdx) {
          togglePlayPause();
        } else {
          loadTrack(matchIdx, true);
        }
      } else {
        const fullIdx = fullPlaylist.findIndex(t => t.src === heroSrc);
        if (fullIdx !== -1) {
          filterActivePlaylist("all");
          loadTrack(fullIdx, true);
        }
      }
    });
  }

  /* Section Play All Buttons Handler */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".play-section-btn");
    if (!btn) return;

    const playlistType = btn.dataset.playlist;
    filterActivePlaylist(playlistType);

    document.querySelectorAll(".filter-pill").forEach(p => {
      p.classList.toggle("active", p.dataset.filter === playlistType);
    });

    if (currentActivePlaylist.length > 0) {
      loadTrack(0, true);
    }
  });

  /* Filter Pills Handler */
  document.addEventListener("click", (e) => {
    const pill = e.target.closest(".filter-pill, .playlist-nav-item");
    if (!pill) return;

    const filterType = pill.dataset.filter;
    if (!filterType) return;

    document.querySelectorAll(".filter-pill").forEach(p => {
      p.classList.toggle("active", p.dataset.filter === filterType);
    });
    document.querySelectorAll(".playlist-nav-item").forEach(p => {
      p.classList.toggle("active", p.dataset.filter === filterType);
    });

    filterActivePlaylist(filterType);

    // Filter section visibility in DOM
    const sections = document.querySelectorAll(".playlist-row");
    sections.forEach(sec => {
      if (filterType === "all") {
        sec.style.display = "";
      } else {
        const secCategory = sec.dataset.category;
        sec.style.display = (secCategory === filterType) ? "" : "none";
      }
    });
  });

  /* Search Input Filter */
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      const allCards = document.querySelectorAll(".card[data-src]");
      
      allCards.forEach((card) => {
        const title = card.dataset.title.toLowerCase();
        const artist = card.dataset.artist.toLowerCase();
        const match = title.includes(q) || artist.includes(q);
        card.style.display = match ? "" : "none";
      });
    });
  }

  /* Add Local Song File Listener */
  if (localFileInput) {
    localFileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      let localSection = document.getElementById("user-added-songs");
      if (!localSection) {
        localSection = document.createElement("section");
        localSection.className = "row playlist-row";
        localSection.id = "user-added-songs";
        localSection.dataset.category = "all";
        localSection.innerHTML = `
          <div class="row-head">
            <div class="row-title-group">
              <h2>Your Uploaded Songs 🎧</h2>
            </div>
          </div>
          <div class="card-grid" id="local-card-grid"></div>`;

        const contentMain = document.querySelector("main.content");
        const softSongs = document.getElementById("soft-songs");
        if (contentMain && softSongs) {
          contentMain.insertBefore(localSection, softSongs);
        } else if (contentMain) {
          contentMain.appendChild(localSection);
        }
      }

      const grid = localSection.querySelector("#local-card-grid");

      files.forEach((file) => {
        const objectUrl = URL.createObjectURL(file);
        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.title = fileNameWithoutExt;
        card.dataset.artist = "Local Audio File";
        card.dataset.src = objectUrl;

        card.innerHTML = `
          <div class="card-art">
            <img src="pictures/505.jpg" alt="">
            <button class="card-fav-btn" aria-label="Favorite ${fileNameWithoutExt}"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>
            <button class="card-play" aria-label="Play ${fileNameWithoutExt}">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
          <h3 class="card-title">${fileNameWithoutExt}</h3>
          <p class="card-sub">Local File</p>`;

        grid.appendChild(card);
      });

      buildPlaylistFromDOM();
      
      const newTrackIndex = currentActivePlaylist.length - files.length;
      if (newTrackIndex >= 0) {
        loadTrack(newTrackIndex, true);
      }
    });
  }

  /* Global Keyboard Shortcuts */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === "ArrowRight" && e.shiftKey) {
      playNext();
    } else if (e.code === "ArrowLeft" && e.shiftKey) {
      playPrev();
    }
  });

  /* Initial Player Load */
  buildPlaylistFromDOM();
  setPlayPauseIcon(false);
  updateMuteIcon();
  if (currentActivePlaylist.length) {
    loadTrack(0, false);
  }
})();
