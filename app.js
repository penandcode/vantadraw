/**
 * VantaDraw Studio - The Tactical Drafting Engine (Multi-Layer Suite)
 * -----------------------------------------------------------------
 * Design focus: Industrial, Precise, Performance-Grade.
 */

class VantaDraw {
  constructor() {
    // DOM Element Mapping
    this.container = document.querySelector('.canvas-container');
    this.stack = document.getElementById('canvas-stack');
    this.gridCanvas = document.getElementById('grid-canvas');
    this.layerList = document.getElementById('layer-list');
    this.addLayerBtn = document.getElementById('add-layer-btn');
    this.sizeInput = document.getElementById('brush-size');
    this.sizeValue = document.getElementById('size-value');
    this.hudCoords = document.getElementById('hud-coords');
    this.colorPicker = document.getElementById('color-picker');
    this.colorPalette = document.getElementById('color-palette');
    this.clearBtn = document.getElementById('clear-canvas');
    this.exportBtn = document.getElementById('download-art');
    this.cursor = document.getElementById('custom-cursor');
    this.toastContainer = document.getElementById('toast-container');
    this.studioToggle = document.getElementById('studio-toggle');
    this.replayBtn = document.getElementById('replay-session');
    this.toggle = document.getElementById('touchless-toggle');
    
    // UI Modals
    this.shortcutsBtn = document.getElementById('show-shortcuts');
    this.shortcutsModal = document.getElementById('shortcuts-modal');
    this.closeShortcutsBtn = document.getElementById('close-shortcuts');
    
    // Feature Toggles
    this.stabilizerBtn = document.getElementById('stabilizer-toggle');
    this.symmetryBtn = document.getElementById('symmetry-toggle');
    this.mandalaBtn = document.getElementById('mandala-toggle');
    this.gridBtn = document.getElementById('perspective-toggle');
    this.axesInput = document.getElementById('mandala-axes');
    this.axesValue = document.getElementById('axes-value');
    this.app = document.getElementById('app');

    // Drafting State
    this.isDrawing = false;
    this.isPaused = false;
    this.touchlessMode = true;
    this.symmetryActive = false;
    this.stabilizerActive = false;
    this.mandalaActive = false;
    this.gridActive = false;
    this.mandalaAxes = 8;
    this.currentColor = '#ff4d00';
    this.currentSize = 2;
    this.currentTool = 'ink';
    this.currentSurface = 'none';

    // Layer Workspace
    this.layers = [];
    this.activeLayerIndex = 0;
    this.layerCounter = 0;
    this.maxHistory = 50;

    // Kinematics & Points
    this.stabilizedPoint = { x: 0, y: 0 };
    this.lastX = 0;
    this.lastY = 0;
    this.lastP = 1.0;
    this.isFirstMove = true;

    // Stroke Collection
    this.currentStroke = null;

    // Session Memory (Global)
    this.strokeLog = [];
    this.isReplaying = false;

    this.init();
  }

  // --- Core Lifecycle ---

  init() {
    this.createLayer('Primary Workspace');
    this.setupEventListeners();
    this.setupPalette();
    this.restoreSession();
    
    window.addEventListener('resize', () => this.resize());

    // Entrance Motion
    if (window.anime) {
      window.anime({
        targets: '.tool-sidebar, .layer-sidebar, .main-header, .stats-panel',
        translateY: [20, 0],
        opacity: [0, 1],
        delay: window.anime.stagger(100),
        easing: 'easeOutExpo'
      });
    }
  }

  // --- Layer Management ---

  createLayer(name = null) {
    const layerId = `layer-${this.layerCounter++}`;
    const canvas = document.createElement('canvas');
    canvas.id = layerId;
    const ctx = canvas.getContext('2d', { alpha: true });
    
    const layer = {
      id: layerId,
      name: name || `Layer ${this.layers.length + 1}`,
      canvas: canvas,
      ctx: ctx,
      visible: true,
      history: [],
      redoStack: []
    };

    this.layers.push(layer);
    this.stack.appendChild(canvas);
    
    requestAnimationFrame(() => {
        this.resizeLayer(layer);
        this.switchLayer(this.layers.indexOf(layer));
        this.renderLayerUI();
    });
    
    if (this.layerCounter > 1) this.showToast(`<span>VantaLayer</span> Created`);
    return layer;
  }

  switchLayer(index) {
    if (index < 0 || index >= this.layers.length) return;
    this.activeLayerIndex = index;
    const layer = this.layers[index];
    this.canvas = layer.canvas;
    this.ctx = layer.ctx;
    this.renderLayerUI();
  }

  toggleLayerVisibility(index, e) {
    if(e) e.stopPropagation();
    const layer = this.layers[index];
    layer.visible = !layer.visible;
    layer.canvas.style.display = layer.visible ? 'block' : 'none';
    this.renderLayerUI();
  }

  deleteLayer(index, e) {
    if(e) e.stopPropagation();
    if (this.layers.length <= 1) {
      this.showToast('Base layer <span>Preserved</span>');
      return;
    }

    const layer = this.layers[index];
    layer.canvas.remove();
    this.layers.splice(index, 1);
    
    const newIdx = Math.min(this.activeLayerIndex, this.layers.length - 1);
    this.switchLayer(newIdx);
    this.showToast('Layer <span>Decommissioned</span>');
  }

  renderLayerUI() {
    if (!this.layerList) return;
    this.layerList.innerHTML = '';
    
    [...this.layers].reverse().forEach((layer, i) => {
      const actualIdx = this.layers.length - 1 - i;
      const item = document.createElement('div');
      item.className = `layer-item ${actualIdx === this.activeLayerIndex ? 'active' : ''} ${!layer.visible ? 'hidden' : ''}`;
      
      const vIcon = layer.visible ? 'eye' : 'eye-off';
      
      item.innerHTML = `
        <div class="layer-visibility" onclick="window.studio.toggleLayerVisibility(${actualIdx}, event)">
            <i data-lucide="${vIcon}"></i>
        </div>
        <div class="layer-name">${layer.name}</div>
        <div class="layer-delete" onclick="window.studio.deleteLayer(${actualIdx}, event)">
            <i data-lucide="trash-2"></i>
        </div>
      `;
      
      item.onclick = (e) => {
          if (e.target.closest('.layer-visibility') || e.target.closest('.layer-delete')) return;
          this.switchLayer(actualIdx);
      };

      this.layerList.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  // --- Engine Logic ---

  resize() {
    this.layers.forEach(l => this.resizeLayer(l));
    this.resizeGrid();
  }

  resizeLayer(layer) {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = layer.canvas.width; tempCanvas.height = layer.canvas.height;
    tempCanvas.getContext('2d').drawImage(layer.canvas, 0, 0);

    layer.canvas.width = rect.width * dpr;
    layer.canvas.height = rect.height * dpr;
    layer.ctx.scale(dpr, dpr);
    layer.ctx.lineCap = 'round'; layer.ctx.lineJoin = 'round';
    layer.ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
  }

  resizeGrid() {
    if (!this.gridCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    this.gridCanvas.width = rect.width * dpr; this.gridCanvas.height = rect.height * dpr;
    const gctx = this.gridCanvas.getContext('2d');
    gctx.scale(dpr, dpr); this.drawGrid();
  }

  setupEventListeners() {
    this.container.addEventListener('pointermove', (e) => this.handleMove(e));
    this.container.addEventListener('pointerdown', (e) => !this.touchlessMode && this.startDrawing(e));
    this.container.addEventListener('pointerup', () => !this.touchlessMode && this.stopDrawing());
    this.container.addEventListener('mouseleave', () => this.stopDrawing());

    // Shortcut Modal Lifecycle
    if (this.shortcutsBtn) this.shortcutsBtn.onclick = () => this.toggleShortcuts(true);
    if (this.closeShortcutsBtn) this.closeShortcutsBtn.onclick = () => this.toggleShortcuts(false);
    if (this.shortcutsModal) {
        this.shortcutsModal.onclick = (e) => { if (e.target === this.shortcutsModal) this.toggleShortcuts(false); };
    }

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      
      if (e.code === 'Space') { this.clearCanvas(); e.preventDefault(); }
      if (ctrl && key === 'z') { if (e.shiftKey) this.redo(); else this.undo(); e.preventDefault(); }
      if (ctrl && key === 'y') { this.redo(); e.preventDefault(); }

      if (key === 'g') {
          this.gridActive = !this.gridActive;
          if (this.gridBtn) this.gridBtn.checked = this.gridActive;
          this.drawGrid(); this.showToast(`Grid: <span>${this.gridActive ? 'ON' : 'OFF'}</span>`);
          this.saveSettings();
      }

      if (key === 's') { 
        this.stopDrawing(); this.touchlessMode = !this.touchlessMode; 
        if(this.toggle) this.toggle.checked = this.touchlessMode; 
        this.showToast(`Mode: <span>${this.touchlessMode ? 'Tactical' : 'Manual'}</span>`); 
        this.saveSettings(); 
      }
      
      if (key === 'm') { 
          this.mandalaActive = !this.mandalaActive; 
          if(this.mandalaBtn) this.mandalaBtn.checked = this.mandalaActive; 
          this.showToast(`Mandala: <span>${this.mandalaActive ? 'ACTIVE' : 'INACTIVE'}</span>`); 
          this.saveSettings(); 
      }
      
      if (key === 'f') {
          this.app.classList.toggle('studio-mode');
          setTimeout(() => this.resize(), 50); // Fluid delay for CSS transition
      }

      if (e.key === 'Escape') {
          if (this.shortcutsModal && this.shortcutsModal.style.display === 'flex') {
              this.toggleShortcuts(false);
          } else if (this.app.classList.contains('studio-mode')) {
              this.app.classList.remove('studio-mode');
              setTimeout(() => this.resize(), 50);
          }
      }
      if (key === 'l') this.createLayer();
      if (key === 'c') this.clearCanvas();
      if (key === 'r') this.replaySession();
      if (key === 'e') this.exportArt();
      
      if (key === '1') this.switchTool('ink');
      if (key === '2') this.switchTool('marker');
      if (key === '3') this.switchTool('charcoal');
      if (key === '4') this.switchTool('calligraphy');
    });

    // UI Bindings
    if (this.addLayerBtn) this.addLayerBtn.onclick = () => this.createLayer();
    if (this.clearBtn) this.clearBtn.onclick = () => this.clearCanvas();
    if (this.exportBtn) this.exportBtn.onclick = () => this.exportArt();
    if (this.toggle) this.toggle.onchange = (e) => { this.touchlessMode = e.target.checked; this.saveSettings(); };
    if (this.sizeInput) {
        this.sizeInput.oninput = (e) => { 
            this.currentSize = e.target.value; 
            if(this.sizeValue) this.sizeValue.textContent = `${this.currentSize}px`; 
            this.saveSettings(); 
        };
    }
    if (this.colorPicker) this.colorPicker.oninput = (e) => { this.currentColor = e.target.value; this.saveSettings(); };
    if (this.stabilizerBtn) this.stabilizerBtn.onchange = (e) => { this.stabilizerActive = e.target.checked; this.saveSettings(); };
    if (this.symmetryBtn) this.symmetryBtn.onchange = (e) => { this.symmetryActive = e.target.checked; this.saveSettings(); };
    if (this.mandalaBtn) this.mandalaBtn.onchange = (e) => { this.mandalaActive = e.target.checked; this.saveSettings(); };
    if (this.gridBtn) this.gridBtn.onchange = (e) => { this.gridActive = e.target.checked; this.drawGrid(); this.saveSettings(); };
    if (this.axesInput) {
        this.axesInput.oninput = (e) => { 
            this.mandalaAxes = parseInt(e.target.value); 
            if(this.axesValue) this.axesValue.textContent = `${this.mandalaAxes} Axes`; 
            this.saveSettings(); 
        };
    }

    document.querySelectorAll('.tool-btn').forEach(btn => btn.onclick = () => this.switchTool(btn.dataset.tool));
    document.querySelectorAll('.surface-btn').forEach(btn => btn.onclick = () => this.applySurface(btn.dataset.surface));
    if (this.studioToggle) this.studioToggle.onclick = () => {
        this.app.classList.toggle('studio-mode');
        setTimeout(() => this.resize(), 50);
    };
    if (this.replayBtn) this.replayBtn.onclick = () => this.replaySession();
  }

  toggleShortcuts(show) {
    if (!this.shortcutsModal) return;
    this.shortcutsModal.style.display = show ? 'flex' : 'none';
    this.isPaused = show;
    this.stopDrawing();
  }

  drawGrid() {
    if (!this.gridCanvas) return;
    const gctx = this.gridCanvas.getContext('2d');
    gctx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
    if (!this.gridActive) return;

    const rect = this.container.getBoundingClientRect();
    const w = rect.width; const h = rect.height;
    const centerX = w / 2; const centerY = h / 2;

    // Technical Square Grid (Architectural)
    gctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    gctx.lineWidth = 1;
    const gridSize = 50;
    
    for (let x = 0; x <= w; x += gridSize) {
        gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, h); gctx.stroke();
    }
    for (let y = 0; y <= h; y += gridSize) {
        gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(w, y); gctx.stroke();
    }

    // Radial Perspective Guides
    gctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    gctx.setLineDash([4, 4]); 

    for (let i = 0; i < 360; i += 15) {
        const rad = (i * Math.PI) / 180;
        gctx.beginPath(); gctx.moveTo(centerX, centerY);
        gctx.lineTo(centerX + Math.cos(rad) * w * 2, centerY + Math.sin(rad) * h * 2);
        gctx.stroke();
    }
    for (let r = 100; r < w; r += 100) {
        gctx.beginPath(); gctx.arc(centerX, centerY, r, 0, Math.PI * 2); gctx.stroke();
    }
    
    // Major Axes
    gctx.strokeStyle = 'rgba(255, 77, 0, 0.15)';
    gctx.setLineDash([]);
    gctx.beginPath(); gctx.moveTo(centerX, 0); gctx.lineTo(centerX, h); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(0, centerY); gctx.lineTo(w, centerY); gctx.stroke();
  }

  handleMove(e) {
    if (!this.container || this.isPaused) return;
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const p = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 1.0;

    if (this.isFirstMove) {
        this.lastX = x; this.lastY = y; this.lastP = p;
        this.stabilizedPoint.x = x; this.stabilizedPoint.y = y;
        this.isFirstMove = false;
        if(this.cursor) this.cursor.style.opacity = '1';
    }

    if (this.cursor) { this.cursor.style.left = `${e.clientX}px`; this.cursor.style.top = `${e.clientY}px`; }

    // HUD Update
    if (this.hudCoords) {
        this.hudCoords.textContent = `X: ${Math.round(x).toString().padStart(3, '0')} // Y: ${Math.round(y).toString().padStart(3, '0')}`;
    }

    let targetX = x; let targetY = y;
    if (this.stabilizerActive) {
      this.stabilizedPoint.x += (x - this.stabilizedPoint.x) * 0.15;
      this.stabilizedPoint.y += (y - this.stabilizedPoint.y) * 0.15;
      targetX = this.stabilizedPoint.x; targetY = this.stabilizedPoint.y;
    }

    if (this.touchlessMode && !this.isDrawing) this.startDrawing(e);
    if (this.isDrawing) this.drawStroke(this.lastX, this.lastY, this.lastP, targetX, targetY, p);

    this.lastX = targetX; this.lastY = targetY; this.lastP = p;
  }

  startDrawing(e) {
    if (!this.ctx || this.isPaused) return;
    this.isDrawing = true;
    this.currentStroke = {
        tool: this.currentTool, color: this.currentColor, size: parseInt(this.currentSize),
        symmetry: this.symmetryActive, mandala: this.mandalaActive, mandalaAxes: this.mandalaAxes,
        segments: []
    };
    this.ctx.beginPath();
  }

  stopDrawing() {
    if (this.isDrawing && this.currentStroke && this.currentStroke.segments.length > 0) {
        const layer = this.layers[this.activeLayerIndex];
        layer.history.push(this.currentStroke);
        if (layer.history.length > this.maxHistory) layer.history.shift();
        layer.redoStack = [];
    }
    this.isDrawing = false; this.currentStroke = null;
  }

  drawStroke(x1, y1, p1, x2, y2, p2) {
    if (!this.ctx || this.isReplaying) return;
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.currentSize * ((p1 + p2) / 2);

    if (this.currentTool === 'calligraphy') {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      this.ctx.lineWidth = Math.max(1, (this.currentSize * p2) * Math.abs(Math.cos(angle - Math.PI/4)));
    }
    if (this.currentTool === 'charcoal') {
      this.ctx.globalAlpha = 0.3;
      for (let i = 0; i < 4; i++) {
        const offset = (Math.random() - 0.5) * this.currentSize;
        this._drawSegment(this.ctx, x1 + offset, y1 + offset, x2 + offset, y2 + offset);
      }
      this.ctx.globalAlpha = 1.0;
    } else { this._drawSegment(this.ctx, x1, y1, x2, y2); }

    if (this.symmetryActive) {
      const rect = this.container.getBoundingClientRect(); const midX = rect.width / 2;
      this._drawSegment(this.ctx, midX - (x1 - midX), y1, midX - (x2 - midX), y2);
    }
    if (this.mandalaActive) {
      const rect = this.container.getBoundingClientRect(); const midX = rect.width / 2; const midY = rect.height / 2;
      const step = (Math.PI * 2) / this.mandalaAxes;
      for (let i = 1; i < this.mandalaAxes; i++) {
        const angle = i * step;
        const [rx1, ry1] = this._rotate(x1, y1, midX, midY, angle);
        const [rx2, ry2] = this._rotate(x2, y2, midX, midY, angle);
        this._drawSegment(this.ctx, rx1, ry1, rx2, ry2);
      }
    }
    if (this.currentStroke) this.currentStroke.segments.push({ x1, y1, p1, x2, y2, p2 });
    this.strokeLog.push({ x1, y1, p1, x2, y2, p2, tool: this.currentTool, color: this.currentColor, size: this.currentSize });
  }

  _drawSegment(ctx, x1, y1, x2, y2) {
    if (!ctx) return;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  _rotate(x, y, cx, cy, angle) {
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const nx = (cos * (x - cx)) + (sin * (y - cy)) + cx;
    const ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
    return [nx, ny];
  }

  undo() {
    const layer = this.layers[this.activeLayerIndex];
    if (layer.history.length === 0) return;
    layer.redoStack.push(layer.history.pop());
    this.redrawLayer(layer); this.showToast('<span>VantaUndo</span> Success');
  }

  redo() {
    const layer = this.layers[this.activeLayerIndex];
    if (layer.redoStack.length === 0) return;
    layer.history.push(layer.redoStack.pop());
    this.redrawLayer(layer); this.showToast('<span>VantaRedo</span> Success');
  }

  redrawLayer(layer) {
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    layer.history.forEach(stroke => {
        layer.ctx.strokeStyle = stroke.color;
        stroke.segments.forEach(seg => {
            layer.ctx.lineWidth = stroke.size * ((seg.p1 + seg.p2) / 2);
            this._drawSegment(layer.ctx, seg.x1, seg.y1, seg.x2, seg.y2);
            if (stroke.symmetry) {
                const rect = this.container.getBoundingClientRect(); const midX = rect.width / 2;
                this._drawSegment(layer.ctx, midX - (seg.x1 - midX), seg.y1, midX - (seg.x2 - midX), seg.y2);
            }
            if (stroke.mandala) {
                const rect = this.container.getBoundingClientRect(); const midX = rect.width / 2; const midY = rect.height / 2;
                const step = (Math.PI * 2) / stroke.mandalaAxes;
                for (let i = 1; i < stroke.mandalaAxes; i++) {
                    const angle = i * step;
                    const [rx1, ry1] = this._rotate(seg.x1, seg.y1, midX, midY, angle);
                    const [rx2, ry2] = this._rotate(seg.x2, seg.y2, midX, midY, angle);
                    this._drawSegment(layer.ctx, rx1, ry1, rx2, ry2);
                }
            }
        });
    });
  }

  clearCanvas() {
    if (!this.ctx || !this.canvas) return;
    const layer = this.layers[this.activeLayerIndex];
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    layer.history = []; layer.redoStack = [];
    this.showToast('Layer <span>Neutralized</span>');
  }

  replaySession() {
    if (this.isReplaying || this.strokeLog.length === 0) return;
    this.isReplaying = true; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let i = 0;
    const animate = () => {
      if (i >= this.strokeLog.length) { this.isReplaying = false; this.showToast('Replay <span>Terminated</span>'); return; }
      const s = this.strokeLog[i];
      this.ctx.strokeStyle = s.color; this.ctx.lineWidth = s.size * ((s.p1 + s.p2)/2);
      this._drawSegment(this.ctx, s.x1, s.y1, s.x2, s.y2);
      i += (this.strokeLog.length > 2000 ? 50 : 25);
      requestAnimationFrame(animate);
    };
    animate();
  }

  exportArt() {
    const exportCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    exportCanvas.width = this.canvas.width; exportCanvas.height = this.canvas.height;
    const exCtx = exportCanvas.getContext('2d');
    this.layers.forEach(l => { if (l.visible) exCtx.drawImage(l.canvas, 0, 0); });
    const link = document.createElement('a');
    link.download = `vantadraw-export-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL(); link.click();
    this.showToast('Art <span>Published</span>');
  }

  setupPalette() {
    if (!this.colorPalette) return;
    this.colorPalette.innerHTML = '';
    const presets = ['#ffffff', '#ff4d00', '#00f2ff', '#00ffaa', '#ffd700', '#444444', '#111111'];
    presets.forEach(color => {
      const dot = document.createElement('div');
      dot.className = 'color-dot'; dot.style.backgroundColor = color;
      if (color.toLowerCase() === this.currentColor.toLowerCase()) dot.classList.add('active');
      dot.onclick = () => {
        this.currentColor = color; if (this.colorPicker) this.colorPicker.value = color;
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active'); this.saveSettings();
      };
      this.colorPalette.appendChild(dot);
    });
  }

  showToast(message) {
    if (!this.toastContainer) return;
    this.toastContainer.innerHTML = '';
    const toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = message;
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 500);
    }, 2500);
  }

  switchTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    this.saveSettings();
  }

  applySurface(surface) {
    this.currentSurface = surface;
    this.container.className = `canvas-container surface-${surface}`;
    document.querySelectorAll('.surface-btn').forEach(b => b.classList.toggle('active', b.dataset.surface === surface));
    this.saveSettings();
  }

  saveSettings() {
    const settings = { color: this.currentColor, size: this.currentSize, tool: this.currentTool, surface: this.currentSurface, touchless: this.touchlessMode, symmetry: this.symmetryActive, mandala: this.mandalaActive, mandalaAxes: this.mandalaAxes, stabilizer: this.stabilizerActive, grid: this.gridActive };
    localStorage.setItem('vantadraw-settings', JSON.stringify(settings));
  }

  restoreSession() {
    const saved = localStorage.getItem('vantadraw-settings');
    if (saved) {
        const s = JSON.parse(saved);
        this.currentColor = s.color || this.currentColor; this.currentSize = s.size || this.currentSize;
        this.currentTool = s.tool || this.currentTool; this.currentSurface = s.surface || this.currentSurface;
        this.touchlessMode = s.touchless !== undefined ? s.touchless : this.touchlessMode;
        this.symmetryActive = s.symmetry !== undefined ? s.symmetry : this.symmetryActive;
        this.mandalaActive = s.mandala !== undefined ? s.mandala : this.mandalaActive;
        this.mandalaAxes = s.mandalaAxes || this.mandalaAxes;
        this.stabilizerActive = s.stabilizer !== undefined ? s.stabilizer : this.stabilizerActive;
        this.gridActive = s.grid !== undefined ? s.grid : this.gridActive;

        if(this.toggle) this.toggle.checked = this.touchlessMode;
        if(this.symmetryBtn) this.symmetryBtn.checked = this.symmetryActive;
        if(this.mandalaBtn) this.mandalaBtn.checked = this.mandalaActive;
        if(this.stabilizerBtn) this.stabilizerBtn.checked = this.stabilizerActive;
        if(this.gridBtn) this.gridBtn.checked = this.gridActive;
        if(this.axesInput) this.axesInput.value = this.mandalaAxes;
        if(this.axesValue) this.axesValue.textContent = `${this.mandalaAxes} Axes`;
        if(this.sizeInput) this.sizeInput.value = this.currentSize;
        if(this.sizeValue) this.sizeValue.textContent = `${this.currentSize}px`;
        if(this.colorPicker) this.colorPicker.value = this.currentColor;
        
        this.setupPalette(); this.switchTool(this.currentTool); this.applySurface(this.currentSurface);
        this.drawGrid();
    }
  }
}

window.addEventListener('load', () => { window.studio = new VantaDraw(); });
