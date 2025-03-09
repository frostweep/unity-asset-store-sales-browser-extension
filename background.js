// Originally created by https://github.com/Borod4r
// Updated to Manifest v3 and Firefox support by https://github.com/frostweep

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

const SALES_URL = "https://publisher.unity.com/sales";
const BASE_API_URL = "https://publisher.assetstore.unity3d.com";
const PUBLISHER_OVERVIEW_URL = BASE_API_URL + "/api/publisher/overview.json";

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

// HTTP Requests
function getCurrentPeriodUrl(id) {
    return BASE_API_URL + "/api/publisher-info/months/" + id + ".json";
}

function getCurrentRevenueUrl(id, period) {
    return BASE_API_URL + "/api/publisher-info/sales/"+ id + "/" + period + ".json";
}

function get(url) {
    return new Promise((resolve, reject) => {
        fetch(url, {
            method: 'GET',
            credentials: 'include'
        }).then(response => {
                if (!response.ok) {
                    showErrorBadge();
                    reject(response.statusText);
                } else {
                    resolve(response.text());
                }
            })
            .catch(error => {
                showErrorBadge();
                reject(error);
            });
    });
}

function getPublisherId() {
    var id = get(PUBLISHER_OVERVIEW_URL)
        .then(JSON.parse)
        .then(function (result) {
            return result.overview.id;
        });

    return id;
}

function getCurrentPeriod(id) {

    var period = get(getCurrentPeriodUrl(id))
        .then(JSON.parse)
        .then(function (result) {
            return result.periods[0].value;
        });

    return period;
}

function getCurrentRevenue() {
    showLoadingBadge();
    getPublisherId().then(function(id) {
        getCurrentPeriod(id).then(function(period) {
            get(getCurrentRevenueUrl(id, period))
                .then(JSON.parse)
                .then(function (result) {
                    var arr = result.aaData;
                    var revenue= 0.0;
                    for(var i in arr) {
                        revenue += parseFloat(arr[i][5].replace(/\$|,/g, ''));
                    }
                    revenue = Math.round(revenue * 0.7);
                    showRevenueBadge(revenue);
                    checkRevenueDiff(period, revenue, showRevenueNotification);
                }, chainError);
        }, chainError);
    }, chainError);
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