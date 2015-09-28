/**
 * test 界面生成 echarts js
 */
// 路径配置  develop 模式------正式项目中不使用
/* require.config({ // 路径配置  其实就是把告诉esl.js相关的文件路径去哪里找
            packages: [
                {
                    name: 'echarts',
                    location: '../plugins/echarts2.2.7',//这里与目录有关，这个./src的意思就是到本文件的所在目录下的src目录下查找
                    main: 'echarts'
                },
                {
                    name: 'zrender',
                    location: '../plugins/zrender',
                    main: 'zrender'
                }
            ]
        }); */
// for echarts online home page
function option1(){
	 option = {
            tooltip: {
                show: true
            },
            legend: {
                data:['销量']
            },
            xAxis : [
                {
                    type : 'category',
                    data : ["衬衫1","羊毛衫1","雪纺衫1","裤子1","高跟鞋1","袜子1"]
                }
            ],
            yAxis : [
                {
                    type : 'value'
                }
            ],
            series : [
                {
                    "name":"销量",
                    "type":"bar",
                    "data":[5, 20, 40, 10, 10, 20]
                }
            ]
        };
	return option;
}

