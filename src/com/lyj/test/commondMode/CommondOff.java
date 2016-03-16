package com.lyj.test.commondMode;

public class CommondOff implements Commond {
	private Tv tv;
	public CommondOff(Tv tv) {
		this.tv=tv;
		
	} 
	@Override
	public void excute() {
		tv.off();
	}
	
}
