package com.lyj.test.commondMode;

public class TestTv {

	/**
	 * @Title: main
	 * @Description: 命令模式可以指定多个命令不同形式
	 * @param @param args    设定文件
	 * @return void    返回类型
	 * @author liuyijiao
	 * @date 2016-3-16 下午04:48:44
	 * @version V1.0
	 * @throws
	 */
	public static void main(String[] args) {
		 Tv tv=new Tv();
		 CommondOn on=new CommondOn(tv);
		 CommondOff off=new CommondOff(tv);
		 CommondChange change1=new CommondChange(tv,1);
		 CommondChange change2=new CommondChange(tv,2);
		 CommondChange change3=new CommondChange(tv,3);
		 Control control=new Control();
		 control.addCommond(on);//开机
		 control.addCommond(change1);//换台
		 control.addCommond(change2);//..
		 control.addCommond(change3);//..
		 Commond pre= control.getPreCommond();//换台上一个
		 control.addCommond(pre);//..
		 control.addCommond(off);//关机
		 control.excute();
	}

}
