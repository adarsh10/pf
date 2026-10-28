(() => {
  const projects = {
    'honda-elevate': {
      title: 'Honda Elevate breakdown',
      headline: 'Get to know the car, one part at a time.',
      description: 'Explore a searchable component atlas, switch to a learning cutaway, or follow a guided tour. The schematic works locally; the detailed exterior connects to Sketchfab when loaded.',
      note: 'Independent learning prototype, not repair guidance or official Honda CAD. The exterior is a community 2024 ZX reference, not an exact 2025 VX model. Launching the exterior may send normal connection data to Sketchfab.',
    },
    'sage-interiors': {
      title: 'DIY interior design studio',
      headline: 'Make a few changes. See what holds together.',
      description: 'A real-time bedroom studio with editable materials, furniture, lighting, camera views, and a browser-local design library. Drag to orbit and use the panel to start changing the room.',
      note: 'Conceptual visualization, not measured CAD or construction advice. Any drawings and contractor briefs require a professional site check. Saved designs stay in this browser; no model API is connected.',
    },
    'f1-racing': {
      title: 'Formula 1 in BIC, India',
      headline: 'Your next braking point is waiting.',
      description: 'Choose a seat, then take on a three-lap race. Use W/A/S/D or arrow keys, C to change camera, R to reset, and M to mute. Click inside the game to give it keyboard focus. Sound starts only after you begin.',
      note: 'Desktop keyboard or gamepad recommended; this experiment does not offer touch driving. Requires WebGL. A fan-made, simplified simulation, not official Formula 1 software or validated vehicle dynamics.',
    },
    'flight-171': {
      title: 'Air India 171: The story',
      headline: 'Read the evidence. Keep the gaps visible.',
      description: 'An independent educational account of the Air India crash, with a source-led timeline, evidence ledger, and separate illustrative 3D view. No graphic imagery or recreated cockpit audio.',
      note: 'This concerns a real tragedy. It is not an official investigation, a finding of cause, or a live update service. The route and motion are illustrative, not flight-recorder telemetry. Refer to the official publications linked in the app for updates.',
    },
  };
  const key = new URLSearchParams(location.search).get('project');
  if (!Object.hasOwn(projects, key)) return;
  const project = projects[key];
  const url = `projects/${key}/index.html?clawpilotTheme=${document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'}`;
  document.title = `${project.title} — AI play`;
  document.getElementById('app-title').textContent = project.title;
  document.getElementById('launch-title').textContent = project.headline;
  document.getElementById('launch-description').textContent = project.description;
  const note = document.getElementById('launch-note');
  note.textContent = project.note;
  note.hidden = false;
  document.getElementById('back-to-project').href = `ai-play.html#${key}`;
  const direct = document.getElementById('open-direct');
  direct.href = url;
  direct.hidden = false;
  const button = document.getElementById('launch-button');
  button.hidden = false;
  button.addEventListener('click', () => {
    button.disabled = true;
    document.getElementById('launch-panel').hidden = true;
    const loading = document.getElementById('app-loading');
    loading.hidden = false;
    const frame = document.createElement('iframe');
    frame.className = 'app-frame';
    frame.title = project.title;
    frame.allow = 'fullscreen; gamepad';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'no-referrer';
    frame.addEventListener('load', () => {
      loading.hidden = true;
      frame.focus();
    });
    frame.src = url;
    document.getElementById('main').appendChild(frame);
  }, { once: true });
})();
