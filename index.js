var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var url = require('url');
var mkdirp = require('mkdirp');
var phantom = require('phantom');

//var pageUrl = 'http://detail.tmall.com/item.htm?id=38757143668';

var imgReg = /http:\/\/img.+?\.(jpeg|jpg|gif|png)/gi;
var urls = [];

var args = process.argv.slice(2);
if (args[0] === undefined) {
    console.log('缺少必要的参数');
    return;
} else if (args[0] === '-f') {
    var fileName = args[1];
    if (fileName === undefined) {
        console.log('请指定url所在的文件');
        return;
    }

    var fileName = path.resolve(args[1]);
    try {
        var content = fs.readFileSync(fileName).toString();
    } catch (err) {
        console.log(err);
        return;
    }

    urls = urls.concat(content.trim().split(os.EOL));

} else { //url, 未对url格式进行校验
   urls.push(args[0]); 
}

//开始
start();

function start() {
    featchPage();
}

function featchPage() {
    var page;
    var ph;

    phantom.create(function (_ph) {
        ph = _ph;
        ph.createPage(function (p) {
            page = p; 
            openPage(urls.shift());
        });
    });

    function openPage(pageUrl) {
        if (pageUrl === undefined) {
            ph.exit();
            return false; 
        } 

        page.open(pageUrl, function (status) {
            if (status !== 'success') {
                console.log(status);
                openPage(urls.shift());
            }
            
            page.evaluate(function () {
                var img = document.querySelectorAll('#J_UlThumb img');
                var imgLinks = [].slice.call(img).map(getLink);

                var attrItems = document.querySelectorAll('#J_AttrUL li');
                var num = '';
                [].slice.call(attrItems).forEach(getNum);

                return {
                    num: num,
                    itemImages: imgLinks,
                    descUrl: TShop.cfg().api.descUrl
                };

                function getLink(image) {
                    return image.src.replace(/\.jpg_.*/, '.jpg'); //换成大图
                }

                function getNum(item) {
                    var text = item.textContent;
                    if (text.indexOf('货号') >= 0) {
                        num = item.getAttribute('title').trim();
                        return false; 
                    }
                }
                
            }, function (result) {
                http.get(result.descUrl, function (res) {
                    res.setEncoding('utf-8'); 
                    var data = '';
                    res.on('data', function (chunk) {
                        data += chunk;
                    });
                    res.on('end', function () {
                        var detailImages = data.match(imgReg);
                        openPage(urls.shift()); //递归调用
                        featchImage({
                            num: result.num,
                            itemImages: result.itemImages,
                            detailImages: detailImages
                        });
                    });
                });
            }); //end evaluate
        }); 
    }
}

function featchImage(opts) {
    var prefix = 'images/' + opts.num + '/';

    mkdirp(prefix, function (err) {
        if (err) {
            console.log(err);
            return;
        }

        opts.itemImages.forEach(function (src, i) {
            var name = prefix + (i + 1) + path.extname(url.parse(src).pathname)
            saveImage(src, name);
        });
        opts.detailImages.forEach(function (src, i) {
            var name = prefix + 'x' + (i + 1) + path.extname(url.parse(src).pathname)
            saveImage(src, name);
        });
    });
}

function saveImage(src, name) {
    http.get(src, function (res) {
        var file = fs.createWriteStream(name); 
        file.on('close', function () {
            console.log('OK! ' + name + ' saved !');
        });

        res.pipe(file);
    }).on('error', function (err) {
        console.log('ERROR! ' + name + ' featch failed !');
        console.log(err);
    });
}


