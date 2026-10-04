// Needs: GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 LD_LIBRARY_PATH=/usr/lib/gnome-shell
// Usage: GSETTINGS_BACKEND=memory gjs -m tools/prefs-preview.js [page] [out.png]
// Opens the preferences window outside GNOME Shell's extension service,
// which is handy before the shell has picked up the extension (Wayland needs
// a re-login for that). Optionally saves a screenshot of one page.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Gtk from 'gi://Gtk';

// The extension service installs String.prototype.format; do the same.
String.prototype.format = imports.format.format;
Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));

const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const dir = Gio.File.new_for_path(`${root}/src`);
const metadata = JSON.parse(new TextDecoder().decode(dir.get_child('metadata.json').load_contents(null)[1]));
Object.assign(metadata, {path: dir.get_path(), dir});

const [page, out] = ARGV;
Adw.init();
const loop = new GLib.MainLoop(null, false);
async function run() {
    const {default: Prefs} = await import(`${dir.get_uri()}/prefs.js`);
    const prefs = new Prefs(metadata);
    // gettext normally finds the extension through the extension service.
    const {ExtensionPreferences} = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
    ExtensionPreferences.lookupByURL = () => prefs;
    ExtensionPreferences.lookupByUUID = () => prefs;
    const window = new Adw.PreferencesWindow();
    await prefs.fillPreferencesWindow(window);
    if (page)
        window.set_visible_page_name(page);
    window.present();
    window.connect('close-request', () => loop.quit());
    if (!out)
        return;
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
        const paintable = new Gtk.WidgetPaintable({widget: window});
        const snapshot = new Gtk.Snapshot();
        paintable.snapshot(snapshot, window.get_width(), window.get_height());
        const node = snapshot.to_node();
        const texture = window.get_renderer().render_texture(node,
            new Graphene.Rect({origin: new Graphene.Point({x: 0, y: 0}), size: new Graphene.Size({width: window.get_width(), height: window.get_height()})}));
        texture.save_to_png(out);
        print(`saved ${out}`);
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
}
run().catch(e => {
    logError(e);
    loop.quit();
});
loop.run();
