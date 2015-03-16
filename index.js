#!/usr/local/bin/node

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var url = require('url');
var mkdirp = require('mkdirp');
var phantom = require('phantom');

//var pageUrl = 'http://detail.tmall.com/item.htm?id=38757143668';

var imgReg = /http:\/\/i.+?\.(jpeg|jpg|gif|png)/gi;
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
                console.log('status: %s\n pageUrl: %s', status, pageUrl);
                openPage(urls.shift());
            }
            
            page.evaluate(function () {
                var img = document.querySelectorAll('#dt-tab img, .list-leading img');
                var imgLinks = [].slice.call(img).map(getLink);

                var attrItems = document.querySelectorAll('#mod-detail-attributes .de-feature');
                var num = '';
                [].slice.call(attrItems).forEach(getNum);

                //分类图片
                //var cateItems = document.querySelectorAll('.J_TSaleProp.tb-img li');
                //var cateImages = [].slice.call(cateItems).map(getCateImages);
                
                var descContainer = document.querySelector('#desc-lazyload-container');
                var descUrl = descContainer.getAttribute('data-tfs-url');

                return {
                    num: num,
                    itemImages: imgLinks,
                    descUrl: descUrl
                    //cateImages: cateImages
                };

                function getLink(image) {
                    return image.src.replace(/\.32x32/, ''); //换成大图
                }

                function getNum(item) {
                    var text = item.textContent;
                    if (text.indexOf('货号') >= 0) {
                        num = item.nextElementSibling.textContent;
                        return false; 
                    }
                }

                function getCateImages(cateItem) {
                    var title = cateItem.getAttribute('title');
                    var url = cateItem.querySelector('a').style.backgroundImage.replace(/url\((.*\.jpg)_.*?\)/gi, '$1');

                    return {
                        title: title,
                        url: url
                    };
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
                        fetchImage({
                            num: result.num,
                            itemImages: result.itemImages,
                            detailImages: detailImages,
                            cateImages: []
                        });
                    });
                });
            }); //end evaluate
        }); 
    }
}

function fetchImage(opts) {
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
        opts.cateImages.forEach(function (cateImage, i) {
            var name = prefix + cateImage.title.replace('\\', ' ').replace('/', ' ') + path.extname(url.parse(cateImage.url).pathname);
            console.log('cate image name %s', name);
            saveImage(cateImage.url, name);
        });
    });
}

function saveImage(src, name) {
    if (!/^http/.test(src)) {
        return; 
    }

    src = src + '?t=' + Math.random();

    http.get(src, function (res) {
        var file = fs.createWriteStream(name); 
        file.on('close', function () {
            console.log('OK! ' + name + ' saved !', src);
        });

        res.pipe(file);
    }).on('error', function (err) {
        console.log('ERROR! %s:%s fetch failed !', name, src);
        console.log(err);
    });
}


