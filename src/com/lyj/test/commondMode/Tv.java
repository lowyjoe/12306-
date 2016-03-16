package com.lyj.test.commondMode;
//命令模式
public class Tv {
	public void on(){
		System.out.println("开机....");
	}
	public void off(){
		System.out.println("关机....");
	}
	public void changeChanel(int chanel){
		System.out.println("换台..."+chanel);
	}
}
