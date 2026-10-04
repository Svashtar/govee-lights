// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Mitja Cebokli
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import {hsvToRgb, kelvinToRgb} from '../lib/capabilities.js';

const TAU = Math.PI * 2;

// A Slider whose whole track is a colour gradient (hue, or warm→cool white),
// with a ring handle filled in the selected colour.
const GradientSlider = GObject.registerClass(
class LightsBuddyGradientSlider extends Slider.Slider {
    // stops: [[offset 0–1, {r,g,b}]]; colorAt: value 0–1 → {r,g,b}
    _init(value, stops, colorAt) {
        super._init(value);
        this._stops = stops;
        this._colorAt = colorAt;
        this.add_style_class_name('lightsbuddy-gradient-slider');
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const rtl = this.get_text_direction() === Clutter.TextDirection.RTL;
        const barHeight = Math.max(this._barLevelHeight ?? 6, 6) + 4;
        const radius = barHeight / 2;
        const handleRadius = this._handleRadius || 10;
        const left = handleRadius - radius, right = width - handleRadius + radius;
        const top = (height - barHeight) / 2;

        const gradient = new Cairo.LinearGradient(rtl ? right : left, 0, rtl ? left : right, 0);
        for (const [offset, c] of this._stops)
            gradient.addColorStopRGB(offset, c.r / 255, c.g / 255, c.b / 255);

        cr.arc(left + radius, top + radius, radius, TAU / 4, TAU * 3 / 4);
        cr.arc(right - radius, top + radius, radius, TAU * 3 / 4, TAU / 4);
        cr.closePath();
        cr.setSource(gradient);
        cr.fill();

        let x = handleRadius + (width - 2 * handleRadius) * this.value / this.maximumValue;
        if (rtl)
            x = width - x;
        const c = this._colorAt(this.value / this.maximumValue);
        cr.arc(x, height / 2, handleRadius, 0, TAU);
        cr.setSourceRGB(1, 1, 1);
        cr.fill();
        cr.arc(x, height / 2, handleRadius - 3, 0, TAU);
        cr.setSourceRGB(c.r / 255, c.g / 255, c.b / 255);
        cr.fill();
        cr.$dispose();
    }
});

export function hueSlider(value) {
    const stops = [0, 1, 2, 3, 4, 5, 6].map(i => [i / 6, hsvToRgb(i * 60 % 360, 1, 1)]);
    return new GradientSlider(value, stops, v => hsvToRgb(v * 359, 1, 1));
}

export function temperatureSlider(value, min, max) {
    const at = v => kelvinToRgb(min + v * (max - min));
    const stops = [0, 0.25, 0.5, 0.75, 1].map(v => [v, at(v)]);
    return new GradientSlider(value, stops, at);
}
