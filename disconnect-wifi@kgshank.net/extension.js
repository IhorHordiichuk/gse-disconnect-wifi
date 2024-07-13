/*******************************************************************************
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 * 
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <http://www.gnu.org/licenses/>.
 * *****************************************************************************
 * Original Author: Gopi Sankar Karmegam
 ******************************************************************************/

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension, gettext as _, ngettext, pgettext} from 'resource:///org/gnome/shell/extensions/extension.js';
import NM from 'gi://NM';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickSettingsItem} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { _log as _l, dump as _d, SignalManager, ssidToLabel, setLog } from './convenience.js';
import * as Constants from './definitions.js';

const RECONNECT_TEXT = "Reconnect"
const SPACE = " ";

const ADD_TIMEOUT_KEY = "ADD_DEVICE"
const RECONNECT_TIMEOUT_KEY = "RECONNECT_DEVICE"


export const DisconnectItem = GObject.registerClass(
   class DisconnectItem extends QuickSettingsItem {
        _init() {
            super._init({
                style_class: 'icon-button',
                //style_class: 'popup-menu-icon',
                can_focus: true,
                icon_name : 'network-wireless-offline-symbolic',
                x_align: Clutter.ActorAlign.END,
                x_expand:true,
                label: "Disconnect"
            });
            this.connect('clicked', () => {
            //    Main.overview.hide();
            //    Main.panel.closeQuickSettings();
            //    this._settingsApp.activate();
            });
    
            this._sync();
        }
    
        _sync() {
            //this.visible =
            //    this._settingsApp != null && Main.sessionMode.allowSettings;
        }
    });
    

class WifiDevice {
    constructor(device, _network) {
        _l("WifiDevice constructor")
        this.device = device;
        this.network = _network;
        this.client = _network._client;
        this.activeConnection = device.active_connection;
        this.accessPoint = device.active_access_point;
        this.timeOuts = new Map();
        this._signalManager = new SignalManager();

        this.uiItem = new PopupMenu.PopupMenuSection();
                
        this.uiItem.disconnectItem = this.uiItem.addAction(_("Disconnect"), () => device.disconnect(null));
        //this.uiItem.moveMenuItem(this.uiItem.disconnectItem, 2);
        this.uiItem.disconnectItem.actor.visible = false;

        this.uiItem.reconnectItem = this.uiItem.addAction(_(RECONNECT_TEXT), () => { this._reconnect(); });
        //this.uiItem.moveMenuItem(this.uiItem.reconnectItem, 3);
        this.uiItem.reconnectItem.actor.visible = false;
        //const button = new DisconnectItem();
        
        //this.uiItem.actor.add_child(button)
        
        this._addAllMenus();
        this._signalManager.addSignal(this._gsettings, "changed::" + Constants.SHOW_RECONNECT_ALWAYS, this._setReconnectVisibility.bind(this));
        
    }

    _reconnect() {
        _l("Reconnect the device.." + this.device.get_permanent_hw_address())

        if (this.timeOuts.get(RECONNECT_TIMEOUT_KEY)) {
            _l("Removing Timeout");
            GLib.source_remove(this.timeOuts.get(RECONNECT_TIMEOUT_KEY));
            this.timeOuts.delete(RECONNECT_TIMEOUT_KEY)
        }

        if (this.device.state > NM.DeviceState.DISCONNECTED) {
            if (this.device.state != NM.DeviceState.DEACTIVATING && this.device.state != NM.DeviceState.DISCONNECTING) {
                this.device.disconnect(null);
            }
            _l("Adding Timeout");
            this.timeOuts.set(RECONNECT_TIMEOUT_KEY, GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => this._reconnect()))
        }
        else {
            var connection = this.activeConnection?.connection || null;
            this.client.activate_connection_async(connection, this.device, null, null, null);
        }
    }

    _getWifiMenuItem() {
        return this.network._wirelessToggle._items.get(this.device)
    }

    _addAllMenus() {
        if (this.timeOuts.get(ADD_TIMEOUT_KEY)) {
            _l("Removing device add Timeout");
            GLib.source_remove(this.timeOuts.get(ADD_TIMEOUT_KEY));
            this.timeOuts.delete(ADD_TIMEOUT_KEY)
        }

        _l("Adding menu..");
        var menuItem = this._getWifiMenuItem(this.device);
        if (!menuItem) {
            _l("Adding Timeout for new device");
            this.timeOuts.set(ADD_TIMEOUT_KEY, GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => this._addAllMenus(this)))
            return;
        }
        _l(menuItem.name + "---" + menuItem._useSubmenu + "---" + menuItem.get_vertical())
        menuItem.set_vertical(true)
        menuItem.add_child(this.uiItem.actor);
        for (const value of menuItem._networkItems.values()) {
            const button = new DisconnectItem();
            //const icons = new St.BoxLayout();
            ///value.add_child(icons);
    
            //icons.add_child(button)
            //value.add_child(new St.Label({text: "This is test", y_align:Clutter.ActorAlign.CENTER, x_expand:true}))
            value.add_child(button)
            value._label.y_align = Clutter.ActorAlign.CENTER
            //cons.add_child(new St.Icon({style_class: 'popup-menu-icon',  icon_name : 'network-wireless-offline-symbolic'}))
        }
        this._stateChanged(this.device, this.device.state, this.device.state, undefined);

        this._signalManager.addSignal(this.device, 'state-changed', this._stateChanged.bind(this));
    }

    _stateChanged(device, newstate, oldstate, reason) {
        _l(device.get_device_type() + "---" + newstate + "---" + oldstate + "---" + reason)
        if (device.get_device_type() != NM.DeviceType.WIFI) {
            _l("Return :" + 1)
            return;
        }

        if(device.active_connection) {
            this.activeConnection = device.active_connection;
        }
           
        if(device.active_access_point) {
            this.accessPoint = device.active_access_point;
        }

        this.uiItem.disconnectItem.actor.visible = newstate > NM.DeviceState.DISCONNECTED;

        this._setReconnectVisibility(this, newstate);
    }

    _setReconnectVisibility() {
        let state = this.device.state;
        _l("Device Current State: " + state);

        let showReconnect = this._gsettings.get_boolean(Constants.SHOW_RECONNECT_ALWAYS);

        _l(this.accessPoint);
        _l(this.device.accessPoint);
        this.uiItem.reconnectItem.label.text =
            (this.accessPoint && this.accessPoint.get_ssid()) ? _(RECONNECT_TEXT) + SPACE
                + ssidToLabel(this.accessPoint.get_ssid()) : _(RECONNECT_TEXT);

        this.uiItem.reconnectItem.actor.visible
            = (state > NM.DeviceState.UNAVAILABLE && (state == NM.DeviceState.DISCONNECTED || state == NM.DeviceState.DISCONNECTING || showReconnect));
    }

    /*_setDevicesReconnectVisibility() {
        this._devices.forEach((_myDevice) => this._setReconnectVisibility(_myDevice, _myDevice.device.state));
    }*/

    destroy(){
        this._getWifiMenuItem(this.device)?.set_vertical(false)
        this.timeOuts.forEach(GLib.source_remove);
        this.uiItem.destroy();                
    }    
}

export default class WifiDisconnector extends Extension {
    enable() {
        this._gsettings = this.getSettings();
        setLog(this._gsettings.get_boolean(Constants.ENABLE_DEBUG))
        this._nAttempts = 0;
        this._signalManager = new SignalManager();
        this._devices = new Map();
        // Note: Make sure don't initialize anything after this
        (async () => {
            try {
                await import('resource:///org/gnome/shell/ui/status/network.js')
                this._checkDevices();
            }
            catch (error) {
                _l(error)
            }
        })();
    }

    _checkDevices() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            delete this._timeoutId;
        }
        _l("Check Devices")
        this._network = Main.panel.statusArea.quickSettings._network;
        if (this._network) {
            if (!this._network._client) {
                // Shell not initialized completely wait for max of
                // 100 * 1s
                if (this._nAttempts++ < 100) {
                    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, this._checkDevices.bind(this));
                }
            } else {
                _l(this._network._client)
                this._client = this._network._client;
                this._wirelessToggle = this._network._wirelessToggle
                _l(this._network._wirelessToggle)
                this._wirelessToggle._nmDevices.forEach((device) => this._deviceAdded(this._client, device));
                this._signalManager.addSignal(this._client, 'device-added', this._deviceAdded.bind(this));
                this._signalManager.addSignal(this._client, 'device-removed', this._deviceRemoved.bind(this));                
                this._signalManager.addSignal(this._gsettings, "changed::" + Constants.ENABLE_DEBUG, () => setLog(this._gsettings.get_boolean(Constants.ENABLE_DEBUG)));
            }
        }
    }

    _deviceAdded(client, device) {
        if (device.get_device_type() != NM.DeviceType.WIFI) {
            return;
        }

        _l("Adding the device.." + device.get_permanent_hw_address())

        this._getWifiDevice(device, true);       
    }    

    _getWifiDevice(device, createNewOnNull = true) {
        var _myDevice = this._devices.get(device);
        if (!_myDevice && createNewOnNull) {
            _myDevice = new WifiDevice(device, this._network);
            this._devices.set(device, _myDevice);
        }

        return _myDevice;
    }

    _deviceRemoved(client, device) {
        if (device.get_device_type() != NM.DeviceType.WIFI) {
            return;
        }
        _l("Removing the device.." + device.get_permanent_hw_address())
        
        this._removeDeviceUI(this._getWifiDevice(device, false))
    }

    _removeDeviceUI(_myDevice) {
        if (!_myDevice) {
            return;
        }
        
        _myDevice.destroy();
        this._signalManager.disconnectBySource(_myDevice.device);
    }    

    disable() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);            
        }
        this._devices.forEach(this._removeDeviceUI.bind(this));
        this._signalManager.disconnectAll();
    }
};
