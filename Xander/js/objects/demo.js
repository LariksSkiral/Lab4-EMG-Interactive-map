/* ═══════════════════════════════════════════════════════
   js/objects/demo.js
   Builds the starter demo scene (office floor plan).
   Called once on first launch.
═══════════════════════════════════════════════════════ */

W3D.buildDemoScene = function () {
  const F = W3D.Factory;

  /* ── Ground floor ── */
  const floor = F.floor({ width: 18, depth: 14, color: '#dde2e8' });
  floor.name = 'Ground Floor';
  floor.mesh.position.set(0, 0, 0);

  /* ── Perimeter walls ── */
  const walls = [
    { s: { x: -9, z: -7 }, e: { x:  9, z: -7 }, name: 'North Wall' },
    { s: { x:  9, z: -7 }, e: { x:  9, z:  7 }, name: 'East Wall'  },
    { s: { x:  9, z:  7 }, e: { x: -9, z:  7 }, name: 'South Wall' },
    { s: { x: -9, z:  7 }, e: { x: -9, z: -7 }, name: 'West Wall'  },
  ];
  walls.forEach(w => {
    const obj = F.wallFromPoints(w.s, w.e, { height: 3, depth: 0.22, color: '#b8c4d0' });
    if (obj) obj.name = w.name;
  });

  /* ── Interior partition walls ── */
  const iw1 = F.wallFromPoints({ x: -2, z: -7 }, { x: -2, z: 0 }, { height: 3, depth: 0.15, color: '#c4cdd6' });
  if (iw1) iw1.name = 'Partition Wall';
  const iw2 = F.wallFromPoints({ x: -2, z: 1.5 }, { x: -2, z: 7 }, { height: 3, depth: 0.15, color: '#c4cdd6' });
  if (iw2) iw2.name = 'Partition Wall 2';

  /* ── Door ── */
  const door = F.door({ color: '#c4a882' });
  door.mesh.position.set(-2, 0, 0.75);
  door.mesh.rotation.y = Math.PI / 2;
  door.name = 'Meeting Room Door';

  /* ── Window in north wall ── */
  const win = F.window({ width: 3, height: 1.4, color: '#aad4ee' });
  win.mesh.position.set(4, 1.5, -7);
  win.name = 'North Window';

  /* ── Zone: meeting room (left) ── */
  const meetingZone = F.zone(
    [{ x: -9, z: -7 }, { x: -2, z: -7 }, { x: -2, z: 7 }, { x: -9, z: 7 }],
    { color: '#e8720c', opacity: 0.18, label: 'Meeting Room' }
  );
  if (meetingZone) meetingZone.name = 'Meeting Room';

  /* ── Zone: open office (right) ── */
  const officeZone = F.zone(
    [{ x: -2, z: -7 }, { x: 9, z: -7 }, { x: 9, z: 7 }, { x: -2, z: 7 }],
    { color: '#2b8cde', opacity: 0.14, label: 'Open Office' }
  );
  if (officeZone) officeZone.name = 'Open Office';

  /* ── Conference table ── */
  const table = F.box({ width: 3.5, height: 0.08, depth: 1.6, color: '#c8a878' });
  table.mesh.position.set(-5.5, 0.76, -1);
  table.name = 'Conference Table';

  /* ── Chairs ── */
  for (let i = 0; i < 4; i++) {
    const chair = F.cylinder({ radiusTop: 0.28, radiusBottom: 0.28, height: 0.06, color: '#9aaabb' });
    chair.mesh.position.set(-4.7 + i * 1.0, 0.74, 0.4);
    chair.name = 'Chair ' + (i + 1);
  }

  /* ── Desks (open office) ── */
  [[2.5, 0.76, -4], [5, 0.76, -4], [2.5, 0.76, -1.5], [5, 0.76, -1.5]].forEach(([x, y, z], i) => {
    const desk = F.box({ width: 1.4, height: 0.06, depth: 0.8, color: '#c8b090' });
    desk.mesh.position.set(x, y, z);
    desk.name = 'Desk ' + (i + 1);
  });

  /* ── Floor line: corridor ── */
  const corridor = F.floorLine(
    [{ x: -2, z: -6.5 }, { x: -2, z: 6.5 }],
    { color: '#f5c200', lineWidth: 0.1 }
  );
  if (corridor) corridor.name = 'Corridor Line';

  /* ── Floor line: entrance path ── */
  const entrance = F.floorLine(
    [{ x: 7, z: 6.5 }, { x: 7, z: 4 }, { x: 3, z: 4 }],
    { color: '#e8720c', lineWidth: 0.08 }
  );
  if (entrance) entrance.name = 'Entrance Path';

  /* ── Column ── */
  const col = F.column({ radius: 0.22, height: 3, color: '#b0bcc8' });
  col.mesh.position.set(6, 0, 0);
  col.name = 'Support Column';

  /* ── Info point: main entrance ── */
  const ip1 = F.infoPoint({
    label: '📍 Main Entrance',
    description: 'Welcome to the building!\n\nCapacity: 120 people\nFloor: Ground (1F)\nAccess: Public\n\nFor assistance, contact reception at ext. 100.',
    color: '#e8720c',
  });
  ip1.mesh.position.set(7, 0, 5.5);
  ip1.name = 'Main Entrance Info';

  /* ── Info point: meeting room ── */
  const ip2 = F.infoPoint({
    label: '🗂 Meeting Room A',
    description: 'Conference Room — Capacity: 10\n\nEquipment:\n• Projector (HDMI)\n• Whiteboard\n• Video conferencing\n\nBooking: calendar@example.com\nExtension: 201',
    color: '#f5c200',
  });
  ip2.mesh.position.set(-5.5, 0, 4);
  ip2.name = 'Meeting Room Info';

  /* ── Info point: fire exit ── */
  const ip3 = F.infoPoint({
    label: '🚪 Fire Exit',
    description: 'Emergency exit — always keep clear.\nAssembly point: parking lot north side.',
    color: '#e84040',
  });
  ip3.mesh.position.set(8.5, 0, 6);
  ip3.name = 'Fire Exit Info';

  /* ── 3D label ── */
  const lbl = F.label3d({ text: 'GROUND FLOOR · PLAN', color: '#f5c200', size: 0.38 });
  lbl.mesh.position.set(3, 3.4, -6.5);
  lbl.name = 'Floor Label';

  /* ── Point light ── */
  const pl = F.pointLight({ color: '#fff4cc', intensity: 0.9, distance: 14 });
  pl.mesh.position.set(-5.5, 2.8, 0);
  pl.name = 'Meeting Room Light';

  W3D.SceneTree.rebuild();
};
