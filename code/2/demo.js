//
// 官方插件仅作为 DEMO
// 具体检测能力请根据业务来定制~
//
// 10月底我们将更新一版官方插件，公开一些零规则检测攻击的插件，以及一些应用的专用插件
// 

'use strict'
var plugin = new RASP('offical')

var clean = {
    action: 'ignore',
    message: '无风险'
}

var xssRegex  = /<script|script>|<iframe|iframe>|javascript:(?!(?:history\.(?:go|back)|void\(0\)))/i
var nameRegex = /\.(jspx?|php[345]?|phtml)\.?$/i
var ntfsRegex = /::\$(DATA|INDEX)$/i
var uaRegex   = /nessus|sqlmap|nikto|havij|netsparker/i
var sqlRegex  = /\bupdatexml\s*\(|\bextractvalue\s*\(|\bunion.*select.*(from|into|benchmark).*\b/i
var sysRegex  = /^\/(etc|proc|sys|var\/log)(\/|$)/
var ognlPayloads = [
    'ognl.OgnlContext',
    'ognl.TypeConverter',
    'ognl.MemberAccess',
    '_memberAccess',
    'ognl.ClassResolver',
    'java.lang.Runtime',
    'java.lang.Class',
    'java.lang.ClassLoader',
    'java.lang.System',
    'java.lang.ProcessBuilder',
    'java.lang.Object', 'java.lang.Shutdown',
    'java.io.File',
    'javax.script.ScriptEngineManager',
    'com.opensymphony.xwork2.ActionContext'
]
var deserializationInvalidClazz = [
    'org.apache.commons.collections.functors.InvokerTransformer',
    'org.apache.commons.collections.functors.InstantiateTransformer',
    'org.apache.commons.collections4.functors.InvokerTransformer',
    'org.apache.commons.collections4.functors.InstantiateTransformer',
    'org.codehaus.groovy.runtime.ConvertedClosure',
    'org.codehaus.groovy.runtime.MethodClosure',
    'org.springframework.beans.factory.ObjectFactory'
]

function canonicalPath (path) {
    return path.replace(/\/\.\//g, '/').replace(/\/+/g, '/')
}

plugin.register('directory', function (params) {
    var path = canonicalPath(params.path)
    if (path.indexOf('/../../../') !== -1 || path.indexOf('\\..\\..\\..\\') !== -1) {
        return {
            action: 'block',
            message: '目录遍历攻击'
        }
    }

    if (sysRegex.test(path)) {
        return {
            action: 'block',
            message: '读取系统目录'
        }
    }
    return clean
})

plugin.register('readFile', function (params) {
    var path = canonicalPath(params.path)
    if (path.indexOf('/../../../') !== -1 || path.indexOf('\\..\\..\\..\\') !== -1) {
        return {
            action: 'block',
            message: '目录遍历攻击'
        }
    }

    if (sysRegex.test(params.realpath)) {
        return {
            action: 'block',
            message: '读取系统文件'
        }
    }
    return clean
})

plugin.register('writeFile', function (params) {
    return clean
})

plugin.register('fileUpload', function (params) {
    if (nameRegex.test(params.filename) || ntfsRegex.test(params.filename)) {
        return {
            action: 'block',
            message: '尝试上传脚本文件: ' + params.filename
        }
    }
    return clean
})

plugin.register('sql', function (params, context) {
    if (sqlRegex.test(params.query)) {
        return {
            action: 'block',
            message: 'SQL 注入攻击'
        }
    }
    return clean
})

plugin.register('command', function (params) {
    return {
        action: 'block',
        message: '尝试执行命令'
    }
})

plugin.register('xxe', function (params) {
    var items = params.entity.split('://')

    if (items.length >= 2) {
        var protocol = items[0]
        /* eslint-disable */
        var path = items[1];
        /* eslint-enable */
        if (protocol === 'gopher') {
            return {
                action: 'block',
                message: 'SSRF 攻击（gopher 协议)'
            }
        }

        if (protocol === 'file') {
            return {
                action: 'log',
                message: '尝试读取外部实体 (file 协议)'
            }
        }
    }
    return clean
})

plugin.register('ognl', function (params) {
    var ognlExpression = params.expression
    for (var index in ognlPayloads) {
        if (ognlExpression.indexOf(ognlPayloads[index]) > -1) {
            return {
                action: 'block',
                message: '尝试ognl远程命令执行'
            }
        }

    }
    return clean
})

plugin.register('deserialization', function (params) {
    var clazz = params.clazz
    for (var index in deserializationInvalidClazz) {
        if (clazz === deserializationInvalidClazz[index]) {
            return {
                action: 'block',
                message: '尝试反序列化攻击'
            }
        }
    }
    return clean
})

plugin.register('reflection', function(params) {
    var title = '异常的执行流'
    var known = {
        'com.thoughtworks.xstream.XStream.unmarshal': 'xstream 反序列化攻击',
        'org.apache.commons.collections4.functors.InvokerTransformer.transform': 'transformer 反序列化攻击'
    }

    params.stack.some(function (method) {
        if (known[method]) {
            title = known[method]
            return true;
        }
    });

    return {
        action:  'block',
        message: title + ':' + params.clazz + '.' + params.method
    }
})

plugin.register('request', function(params, context) {
    // xss 检测 DEMO
    var parameters = context.parameter;
    var message    = '';

    Object.keys(parameters).some(function (name) {
        parameters[name].some(function (value) {
            if (xssRegex.test(value)) {
                message = 'XSS 攻击: ' + value;
                return true;
            }
        });

        if (message.length) {
            return true;
        }
    });

    if (! message.length) {
        return clean;
    }

    return {
        action: 'block',
        message: message
    }
})

plugin.log('初始化成功')

