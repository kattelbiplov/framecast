import { Menu, app, shell, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '../shared/ipc.js';

export function buildMenu(send: (cmd: MenuCommand) => void): Menu {
  const isMac = process.platform === 'darwin';
  const cmd = (label: string, command: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => send(command),
  });
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            cmd('Settings…', 'preferences', 'Cmd+,'),
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        } satisfies MenuItemConstructorOptions]
      : []),
    {
      label: 'File',
      submenu: [
        cmd('New Recording', 'new-recording', 'CmdOrCtrl+N'),
        cmd('Open Project…', 'open-project', 'CmdOrCtrl+O'),
        { type: 'separator' },
        cmd('Save', 'save', 'CmdOrCtrl+S'),
        cmd('Export…', 'export', 'CmdOrCtrl+E'),
        { type: 'separator' },
        cmd('Library', 'home', 'CmdOrCtrl+Shift+H'),
        ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'quit' } as const]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        cmd('Undo', 'undo', 'CmdOrCtrl+Z'),
        cmd('Redo', 'redo', 'Shift+CmdOrCtrl+Z'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        cmd('Split at Playhead', 'split', 'CmdOrCtrl+B'),
        cmd('Duplicate', 'duplicate', 'CmdOrCtrl+D'),
        // Bare-key shortcuts (Space, Delete, Z) are handled in the renderer so they never fire while
        // typing in a text field; the menu items stay for discoverability.
        cmd('Delete\t⌫', 'delete'),
        cmd('Add Zoom at Playhead\tZ', 'add-zoom'),
      ],
    },
    {
      label: 'View',
      submenu: [
        cmd('Play / Pause\tSpace', 'toggle-play'),
        cmd('Zoom In Timeline', 'zoom-in-timeline', 'CmdOrCtrl+='),
        cmd('Zoom Out Timeline', 'zoom-out-timeline', 'CmdOrCtrl+-'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' } as const, { role: 'reload' } as const]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Framecast Documentation', click: () => void shell.openExternal('https://github.com/') }],
    },
  ];
  return Menu.buildFromTemplate(template);
}
