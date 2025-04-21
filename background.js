// Originally created by https://github.com/Borod4r
// Updated to Manifest v3 and Firefox support by https://github.com/frostweep
// Updated to use Unity v2 API by Oleksandr Selivanov

/*
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

const PUBLISHER_URL = "https://publisher.unity.com";
const SALES_URL = `${PUBLISHER_URL}/sales`;
const MONTLY_SALES_API_URL = `${PUBLISHER_URL}/publisher-v2-api/monthly-sales?date=`;

const ALARM = "refresh";

var pollInterval = 10;  // minutes

const ext = typeof browser !== "undefined" ? browser : chrome;
const isChrome = !(typeof InstallTrigger !== 'undefined');

// Visual
function showLoadingBadge() {
    ext.action.setBadgeBackgroundColor({color:[125,125,125,255]});
    ext.action.setBadgeText({ text: ". . ." } );
}

function showRevenueBadge(revenue) {
    ext.action.setBadgeBackgroundColor({color:[0,125,100,255]});
    ext.action.setBadgeText({ text: revenue.toString() + "$" } );
}

function showErrorBadge() {
    ext.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    ext.action.setBadgeText({ text: "ERR" });
}

// Notifications
async function playNotificationSound(source, volume = 1){
    if(isChrome){
        await createOffscreen();
        await ext.runtime.sendMessage({ play: { source, volume } });
    }else{
        const audio = new Audio(source);
        audio.volume = volume;
        audio.play();
    }
}

async function createOffscreen() {
    if (await ext.offscreen.hasDocument()) return;
    await ext.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'playing audio api'
    });
}

function showRevenueNotification(revenue) {
    var opt = {
        type: "basic",
        title: "Unity Asset Store",
        message: "Earned + " + revenue.toString() + "$",
        iconUrl: ext.runtime.getURL("icon.png")
    };
    ext.notifications.create(opt);
    playNotificationSound('audio/coin.mp3');
}

// Storage
function checkRevenueDiff(period, revenue, callback) {
    var revenueKey = 'revenue_' + period.toString();
    ext.storage.local.get(revenueKey, function (old) {
        var oldRevenue = old[revenueKey] || 0;
        var diff = revenue - oldRevenue;
        if (diff > 0) {
            callback(diff);
            ext.storage.local.set({[revenueKey]: revenue});
        }
    });
}


async function getCurrentRevenue() {
    showLoadingBadge();
    const monthToFetch = `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-01`;
    const monthlySalesUrl = `${MONTLY_SALES_API_URL}${monthToFetch}`;

    try {
        const cookies = await ext.cookies.getAll({ url: PUBLISHER_URL });
        const csrf = cookies.find(c => c.name === '_csrf')?.value;

        if (!csrf) throw new Error('CSRF token not found in cookies');

        const response = await fetch(monthlySalesUrl, {
            headers: {
                'X-Csrf-Token': csrf,
                'X-Source': 'publisher-portal',
                'Accept': '*/*',
                'Referer': SALES_URL,
            },
            credentials: 'include'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        let revenue = 0.0;
        for (const item of data) {
            revenue += parseFloat(item.revenue || 0);
        }
        revenue = Math.round(revenue);
        showRevenueBadge(revenue);
        checkRevenueDiff(monthToFetch, revenue, showRevenueNotification);
    } catch (err) {
        console.error('Fetch error:', err.message);
        showErrorBadge();
    }
}

function chainError(err) {
    showErrorBadge();
    return Promise.reject(err);
}

// Alarms
function scheduleRefreshAlarm() {
    ext.alarms.clear(ALARM);
    ext.alarms.create(ALARM, {
        periodInMinutes: pollInterval
    });
}

// Actions
ext.alarms.onAlarm.addListener(function(alarm) {
    getCurrentRevenue();
});

ext.action.onClicked.addListener(function(tab) {
    ext.tabs.create({ url: SALES_URL });
    scheduleRefreshAlarm();
    getCurrentRevenue();
});

// Init
function onInit() {
    scheduleRefreshAlarm();
    getCurrentRevenue();
}

// Main
onInit();
