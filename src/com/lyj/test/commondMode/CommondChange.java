package com.lyj.test.commondMode;

public class CommondChange implements Commond {
	private Tv tv;
	private int Chanel;
	public CommondChange(Tv tv,int Chanel) {
		this.tv=tv;
		this.Chanel=Chanel;
	} 
	@Override
	public void excute() {
		tv.changeChanel(Chanel);
	}
	
}
