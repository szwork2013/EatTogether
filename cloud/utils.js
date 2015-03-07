/**
 * Created by Meng on 2015/2/2.
 */
var WechatAPI = require('wechat-api');
var WechatOAuth = require('wechat-oauth');

var APPID = 'wx215f75c4627af14a';
var APPSECRET = 'c4dfb380644d4fb5266468da939935d5';
var TEMPID_VERIFY = 'MCbV1foI13HSHg86rP8VirQTxpOBWock_PDtetKFxeA';
var TEMPID_REQUEST = '8KSD3co2eNCjZG6qYgZLlOs6m63QahS5Bk04vxC_JsU';
var TEMPID_BILL = 'yqYazavKFfpXfbSOLkObhsA5u3hMRukHm41Diy3YL8o';
var TEMPID_JOIN = '6ADofGKCi-z1R1iE_Q0fkPxLEXmYFdh4Q-pMFfdChbc';
var TEMPID_QUIT = '32wmlUVHgjnaWJU0K1Rucc4_STGmw8gnGwJo6fUZ1iQ';

var API = new WechatAPI(APPID, APPSECRET);
var OAUTH = new WechatOAuth(APPID, APPSECRET);
var MENU = {
    "button":[
        {
            "type":"view",
            "name":"我的饭团",
            "url": OAUTH.getAuthorizeURL('http://eat.avosapps.com/' + 'myet', '0', 'snsapi_base')
        },
        {
            "name":"菜单",
            "sub_button":[
                {
                    "type":"click",
                    "name":"赞一下我们",
                    "key":"V001_UP"
                }
            ]
        }]
};

if (__local) {
    // 当前环境为「开发环境」，是由命令行工具启动的
    console.log('「开发环境」');
    exports.SERVER = 'http://127.0.0.1:3000/';
} else if(__production) {
    // 当前环境为「生产环境」，是线上正式运行的环境
    console.log('「生产环境」');
    exports.SERVER = 'http://eat.avosapps.com/';
} else {
    // 当前环境为「测试环境」，云代码方法通过 HTTP 头部 X-AVOSCloud-Application-Production:0 来访问；webHosting 通过 dev.xxx.avosapps.com 域名来访问
    console.log('「测试环境」');
    exports.SERVER = 'http://dev.eat.avosapps.com/';
}

exports.CREAT_TUAN = {'id':1, 'name': '建团'};

exports.JOIN_TUAN = {'id':2, 'name': '入团'};

exports.Tuan = AV.Object.extend("Tuan");

exports.TuanHistory = AV.Object.extend("TuanHistory");

exports.Account = AV.Object.extend("Account");

exports.Init = function() {
    console.log("Init");
    //API.createMenu(MENU, function (err, res) {
    //    console.log("createMenu" + JSON.stringify(res));
    //});
};

exports.getOpenId = function(code) {
    var promise = new AV.Promise();
    OAUTH.getAccessToken(code, function (err, result) {
        console.log("getOpenId result: " + JSON.stringify(result));
        if (result.errcode) {
            promise.reject(result);
        } else {
            var accessToken = result.data.access_token;
            var openid = result.data.openid;
            promise.resolve(openid, accessToken);
        }
    });
    return promise;
};

// 订阅公众号
exports.Subscribe = function(openid) {
    return Signup(openid, 'pwd:'+openid, 1).then(function(user) {
        console.log("注册成功: %j", user);
        return AV.Promise.as(user);
    }, function(error) {
        if (error.code == 202) {
            console.log("用户已存在: %s", openid);
            return modifyUserState(openid, 1);
        } else {
            // 非正常状态
            console.log("注册失败: " + JSON.stringify(error));
            promise.reject(error);
        }
    });
};

// 取消订阅
exports.UnSubscribe = function(openid) {
    return modifyUserState(openid, -1);
};

function modifyUserState(openid, flag) {
    var query = new AV.Query(AV.User);
    query.equalTo('username', openid);
    return query.first().then(function(user) {
        user.set('state', flag);
        return user.save();
    });
}

function Signup(username, password, flag) {
    if (username === undefined || password === undefined) {
        var error = new AV.Error(
            AV.Error.OTHER_CAUSE,
            "无效参数");
        return AV.Promise.error(error);
    }

    var user = new AV.User();
    user.set('username', username);
    user.set('nickname', username.substring(username.length-4));
    user.set('password', password);
    user.set('state', flag);

    return user.signUp();
}

exports.Login = function(username, password) {
    var promise = new AV.Promise();

    AV.User.logIn(username, password, {
        success: function(user) {
            // 登录成功，avosExpressCookieSession会自动将登录用户信息存储到cookie
            console.log('登录成功: %j', user);
            promise.resolve(user);
        },
        error: function(user, error) {
            // 登录失败，非正常状态
            console.log("登录失败: " + JSON.stringify(error));
            promise.reject(user);
        }
    });

    return promise;
};

/** 获取用户对应的团信息 */
exports.GetTuanList = function(user) {
    var promise = new AV.Promise();

    var query = new AV.Query(exports.Account);
    query.equalTo('user', user);
    query.notEqualTo('state', -1);
    query.include('tuan');
    query.find().then(function(results) {
        var tuans = [];
        for (var i = 0; i < results.length; i++) {
            var tuan = formatTuan(results[i].get('tuan'));
            tuans.push(tuan);
        }
        promise.resolve(tuans);
    });

    return promise;
};

function formatTuan(tuanobj) {
    var tuan = {};
    tuan.id = tuanobj.get('tuanid');
    tuan.name = tuanobj.get('name');
    tuan.members = tuanobj.get('members');
    tuan.news = tuanobj.get('news');
    return tuan;
}

// attrs = {name, tuanid, count}
exports.CreateTuan = function(attrs, options) {
    var error;
    options = options || {};

    // 参数检查
    if (!(attrs && attrs.name)) {
        error = new AV.Error(
            AV.Error.OTHER_CAUSE,
            "无效参数");
        if (options.error) {
            options.error(error);
        }
        return AV.Promise.error(error);
    }

    var promise = new AV.Promise();

    var tuan = new exports.Tuan();
    AV.Promise.as().then(function() {
        var promise = new AV.Promise();
        if (attrs.tuanid) {
            var query = new AV.Query(exports.Tuan);
            query.equalTo('tuanid', attrs.tuanid);
            query.find().then(function(tuans) {
                if (tuans.length == 0) {
                    tuan.set('tuanid', attrs.tuanid);
                    promise.resolve();
                } else if (tuans.length == 1) {
                    console.log("团已存在");
                    promise.reject("团已存在");
                } else {
                    console.log("出现重复团");
                    promise.reject("出现重复团");
                }
            });
        } else {
            promise.resolve();
        }
        return promise;
    }).then(function() {
        tuan.set('name', attrs.name);
        tuan.set('news', 0);
        tuan.set('members', (attrs.count || 0));
        tuan.set('slogan', 'xxx');
        return tuan.save();
    }).then(function(tuan) {
        // 需要重新query以获得tuanid
        var query = new AV.Query(exports.Tuan);
        return query.get(tuan.id);
    }).then(function(tuan) {
        console.log("建团成功: " + JSON.stringify(tuan));
        if (options.success) {
            options.success(tuan);
        }
        promise.resolve(tuan);
    }, function(error) {
        console.log("建团失败: " + JSON.stringify(error));
        if (options.error) {
            options.error(error);
        }
        promise.reject(error);
    });

    return promise;
};

// 创建一条Account
exports.CreateAccount = function(user, tuan) {
    // 先查询避免重复
    var promise = new AV.Promise();

    var query = new AV.Query(exports.Account);
    query.equalTo('tuan', tuan);
    query.include('user');
    query.find().then(function(results) {
        var found = null;
        for (var i = 0; i < results.length; i++) {
            if (results[i].get('user').id == user.id) {
                found = results[i];
                break;
            }
        }
        if (found) {
            var state = found.get('state');
            if (state == -1) {
                // 给所有团员发消息
                for (var j = 0; j < results.length; j++) {
                    if (results[i].get('state') != -1) {
                        sendTemplate(TEMPID_JOIN, user, results[j].get('user'), tuan);
                    }
                }
                // 之前退出的团，重新加入
                tuan.increment('members');
                found.set('tuan', tuan);
                found.set('state', 0);
            }
            return found.save();
        } else {
            // 给所有团员发消息
            for (var k = 0; k < results.length; k++) {
                sendTemplate(TEMPID_JOIN, user, results[k].get('user'), tuan);
            }
            var account = new exports.Account();
            tuan.increment('members');
            account.set('user', user);
            account.set('tuan', tuan);
            account.set('money', 0);
            account.set('state', 0);
            return account.save();
        }
    }).then(function(account) {
        promise.resolve(account);
    }, function(error) {
        promise.reject(error);
    });

    return promise;
};

// 删除一条Account
exports.DeleteAccount = function(user, tuan) {
    // 先查询避免重复
    var promise = new AV.Promise();

    var query = new AV.Query(exports.Account);
    query.equalTo('tuan', tuan);
    query.notEqualTo('state', -1);
    query.include('user');
    query.find().then(function(results) {
        var found = null;
        for (var i = 0; i < results.length; i++) {
            if (results[i].get('user').id == user.id) {
                found = results[i];
                break;
            }
        }
        if (found) {
            var ret = {};
            ret.code = -1;
            var money = formatFloat(found.get('money'));
            if (money > 10) {
                // 清除账户余额再退团
                ret.message = '您在该团还有较多结余(' + money + ')，请销账后再退团';
                return AV.Promise.as(ret);
            } else if (money < -10) {
                // 清除账户余额再退团
                ret.message = '您在该团还有较多欠款(' + money + ')，请销账后再退团';
                return AV.Promise.as(ret);
            } else {
                // 直接退团
                ret.code = 0;
                ret.message = '您在该团只有(' + money + ')团币，系统已经直接退团';
                // 只标记不删除
                found.set('state', -1);
                found.save();
                // 给所有团员发消息
                for (var j = 0; j < results.length; j++) {
                    if (results[j].get('user').id != user.id) {
                        sendTemplate(TEMPID_QUIT, user, results[j].get('user'), tuan);
                    }
                }
                return AV.Promise.as(ret);
            }
        } else {
            return AV.Promise.error('Account Results Error');
        }
    }).then(function(ret) {
        if (ret.code == 0) {
            // 退团成功
            tuan.increment('members', -1);
            return tuan.save().then(function() {
                return AV.Promise.as(ret);
            });
        } else {
            return AV.Promise.as(ret);
        }
    }).then(function(ret) {
        promise.resolve(ret);
    }, function(error) {
        promise.reject(error);
    });

    return promise;
};

exports.ModifyTuan = function(tuanid, infoJson) {
    var promise = new AV.Promise();

    var query = new AV.Query(exports.Tuan);
    query.equalTo('tuanid', tuanid);
    query.find().then(function(tuans) {
        if (tuans.length == 0) {
            console.log("团不存在");
            promise.reject("团不存在");
        } else if (tuans.length == 1) {
            if (infoJson.name) {
                tuans[0].set('name', infoJson.name);
            }
            if (infoJson.slogan) {
                tuans[0].set('slogan', infoJson.slogan);
            }
            return tuans[0].save(null)
        } else {
            console.log("出现重复团");
            promise.reject("出现重复团");
        }
    }).then(function() {
        console.log("修改团信息成功");
        promise.resolve();
    }, function(error) {
        console.log("修改团信息失败");
        promise.reject(error);
    });
    return promise;
};

exports.FormatTuanDetail = function (tuanobj) {
    var promise = new AV.Promise();
    var tuan = {};
    tuan.id = tuanobj.get('tuanid');
    tuan.name = tuanobj.get('name');
    tuan.news = tuanobj.get('news');
    tuan.slogan = tuanobj.get('slogan');

    var query = new AV.Query(exports.Account);
    query.equalTo('tuan', tuanobj);
    query.notEqualTo('state', -1);
    query.include('user');
    query.find().then(function(results) {
        var members = [];
        for (var i = 0; i < results.length; i++) {
            var user = results[i].get('user');
            members.push({
                'uid': user.id,
                'name': user.get('nickname'),
                'money': formatFloat(results[i].get('money'))
            });
        }
        tuan.members = members;
        promise.resolve(tuan);
    });

    return promise;
};

exports.Bill = function(user, tuanid, members, othersnum, price) {
    var promise = new AV.Promise();

    if (members.length > 0 && othersnum >= 0 && price >= 0) {
        var avg = Math.ceil(price * 100 / (members.length + othersnum)) / 100;

        var query = new AV.Query(exports.Tuan);
        query.equalTo('tuanid', tuanid);
        query.first().then(function(tuan) {
            // 给买单者记账
            var accountQuery = new AV.Query(exports.Account);
            accountQuery.equalTo('tuan', tuan);
            accountQuery.equalTo('user', user);
            accountQuery.notEqualTo('state', -1);
            return accountQuery.first().then(function(account) {
                if (account) {
                    account.increment('money', avg * (members.length - 1));
                    return account.save();
                } else {
                    return AV.Promise.error('买单者不在该团中');
                }
            }).then(function() {
                // 嵌套查询
                var userQuery = new AV.Query(AV.User);
                userQuery.containedIn("objectId", members);
                var accountQuery = new AV.Query(exports.Account);
                accountQuery.equalTo('tuan', tuan);
                accountQuery.notEqualTo('state', -1);
                accountQuery.include('user');
                accountQuery.matchesQuery('user', userQuery);
                return accountQuery.find();
            }).then(function(results) {
                // 给团成员记账
                var promises = [];
                for (var i = 0; i < results.length; i++) {
                    results[i].increment('money', -avg);
                    if (results[i].get('user').id != user.id) {
                        // 给其他成员发送模板消息
                        sendTempBill(user, results[i].get('user'), tuan, price, members.length + othersnum, avg, results[i].get('money'));
                    }
                    promises.push(results[i].save());
                }
                return AV.Promise.when(promises);
            }).then(function() {
                // 生成消费记录
                var tuanHistory = new exports.TuanHistory();
                tuanHistory.set('payer', user);
                tuanHistory.set('tuan', tuan);
                // TODO: 可能是个relation
                tuanHistory.set('members', members);
                tuanHistory.set('othersnum', othersnum);
                tuanHistory.set('price', price);
                return tuanHistory.save();
            });
        }).then(function() {
            promise.resolve();
        }, function(error) {
            // TODO: 这里可能还需要处理失败时退还其他成员扣款的逻辑
            promise.reject(error);
        });
    } else {
        promise.reject('Invalid Parameters');
    }
    return promise;
};

exports.GetTuanHistory = function(tuanid, start, length) {
    var promise = new AV.Promise();

    var tuanHistory = [];
    var innerQuery = new AV.Query(exports.Tuan);
    innerQuery.equalTo('tuanid', tuanid);
    var query = new AV.Query(exports.TuanHistory);
    query.matchesQuery('tuan', innerQuery);
    query.descending("createdAt");
    query.skip(start);
    query.limit(length);
    query.include(['tuan.name']);
    query.find().then(function(results) {
        console.log('Query: ' + JSON.stringify(results));
        for (var i = 0; i < results.length; i++) {
            var history = formatTuanHistory(results[i]);
            tuanHistory.push(history);
        }
        promise.resolve(tuanHistory);
    }, function (error) {
        console.log('Query Error: ' + JSON.stringify(error));
        promise.reject(error);
    });

    return promise;
};

function formatTuanHistory(history) {
    return history.createdAt.toISOString().replace(/T.+/, '') + '，'
        + history.get('tuan').get('name') + '团' + history.get('members').length
        + '人消费' + formatFloat(history.get('price'));
}

/*
// 请求销账，发送模板消息2给toUser
exports.RequestWriteOff = function(fromUser, toUser, tuanid) {
    var promise = new AV.Promise();

    var ret = {};
    if (fromUser.id == toUser.id) {
        ret.code = -1;
        ret.message = '不能和自己销账';
        promise.resolve(ret);
    }

    var query = new AV.Query(exports.Tuan);
    query.equalTo('tuanid', tuanid);
    query.find().then(function(tuans) {
        if (tuans.length == 1) {
            return AV.Promise.as(tuans[0]);
        } else {
            return AV.Promise.error('Tuan Results Error');
        }
    }).then(function(tuan) {
        var data = {
            fromName: {
                "value": fromUser.get('nickname'),
                "color": "#173177"
            },
            toName: {
                "value": toUser.get('nickname'),
                "color": "#173177"
            },
            tuanName: {
                "value": tuan.get('name'),
                "color": "#173177"
            }
        };
        var username = toUser.get('username');
        // 测试账号的信息推送到oUgQgt29VhAPB59qvib78KMFZw1I
        var openid = username.length < 10 ? 'oUgQgt29VhAPB59qvib78KMFZw1I' : username;
        // URL置空，则在发送后,点击模板消息会进入一个空白页面（ios）, 或无法点击（android）
        var url = exports.SERVER + 'verifyWriteOff?uid=' + fromUser.id + '&tuanid=' + tuanid;
        var topcolor = '#FF0000'; // 顶部颜色
        API.sendTemplate(openid, TEMPID_REQUEST, url, topcolor, data, function(err, data, res) {
            if (err) {
                ret.code = -1;
                ret.message = '您的销账请求无法发送给 ' + toUser.get('nickname') + '，请尝试其他团员！';
                console.log('SendTemplate Error %j', err);
            } else {
                ret.code = 0;
                ret.message = '您的销账请求已经发送给 ' + toUser.get('nickname') + '，请联系他确认销账！';
                console.log('SendTemplate Success: %j, %j', data, res);
            }
            promise.resolve(ret);
        });
    });

    return promise;
};

// 确认销账，把fromUser的账户信息划分到toUser（销账不一定非要退团），发模板消息1给fromUser
exports.VerifyWriteOff = function(fromUser, toUser, tuanid) {
    var promise = new AV.Promise();

    if (fromUser.id == toUser.id) {
        ret.code = -1;
        ret.message = '不能和自己销账';
        promise.resolve(ret);
    }

    // 嵌套查询
    var money = 0;
    var tuanQuery = new AV.Query(exports.Tuan);
    tuanQuery.equalTo("tuanid", tuanid);
    var accountQuery = new AV.Query(exports.Account);
    accountQuery.containedIn('user', [fromUser, toUser]);
    accountQuery.include(['user.id']);
    accountQuery.matchesQuery('tuan', tuanQuery);
    accountQuery.find().then(function(accounts) {
        if (accounts.length == 2) {
            var fromIdx = 0, toIdx = 1;
            if (accounts[0].get('user').id == toUser.id) {
                fromIdx = 1;
                toIdx = 0;
            }
            money = accounts[fromIdx].get('money');
            accounts[toIdx].increment('money', money);
            accounts[fromIdx].set('money', 0);
            return AV.Promise.when([accounts[0].save(), accounts[1].save()]);
        } else {
            return AV.Promise.error('Account Results Error');
        }
    }).then(function() {
        sendTemplate(TEMPID_VERIFY, fromUser, toUser, tuan);
        ret.code = 0;
        ret.message = '您已经和 ' + fromUser.get('nickname') + ' 销账 ' + money;
        promise.resolve(ret);
    }, function(error) {
        console.log('Verify WriteOff Error: ' + JSON.stringify(error));
        promise.reject(error);
    });

    return promise;
};
*/

function formatFloat(float) {
    return float.toFixed(2);
}

function sendTempBill(fromUser, toUser, tuan, money, number, avg, remain) {
    var data = {
        fromName: {
            "value": fromUser.get('nickname'),
            "color": "#173177"
        },
        toName: {
            "value": toUser.get('nickname'),
            "color": "#173177"
        },
        tuanName: {
            "value": tuan.get('name'),
            "color": "#173177"
        },
        money: {
            "value": formatFloat(money),
            "color": "#173177"
        },
        number: {
            "value": number,
            "color": "#173177"
        },
        avg: {
            "value": formatFloat(avg),
            "color": "#173177"
        },
        remain: {
            "value": formatFloat(remain),
            "color": "#173177"
        },
        message: {
            "value": remain > 10 ? '，可以坐等大家请吃饭咯' : '，快去请大家吃饭吧',
            "color": "#000000"
        }
    };
    var username = toUser.get('username');
    var openid = username.length < 10 ? 'oUgQgt29VhAPB59qvib78KMFZw1I' : username;
    var topcolor = '#FF0000'; // 顶部颜色
    API.sendTemplate(openid, TEMPID_BILL, null, topcolor, data, function(err, data, res) {
        if (err) {
            console.log('SendTemplate Error %j', err);
        } else {
            console.log('SendTemplate Success: %j, %j', data, res);
        }
    });
}

function sendTemplate(tempId, fromUser, toUser, tuan) {
    var data = {
        fromName: {
            "value": fromUser.get('nickname'),
            "color": "#173177"
        },
        toName: {
            "value": toUser.get('nickname'),
            "color": "#173177"
        },
        tuanName: {
            "value": tuan.get('name'),
            "color": "#173177"
        }
    };
    var username = toUser.get('username');
    var openid = username.length < 10 ? 'oUgQgt29VhAPB59qvib78KMFZw1I' : username;
    var topcolor = '#FF0000'; // 顶部颜色
    API.sendTemplate(openid, tempId, null, topcolor, data, function(err, data, res) {
        if (err) {
            console.log('SendTemplate Error %j', err);
        } else {
            console.log('SendTemplate Success: %j, %j', data, res);
        }
    });
}