package com.lyj.test.commondMode;

public class CommondOn implements Commond {
	private Tv tv;
	public CommondOn(Tv tv) {
		this.tv=tv;
	} 
	@Override
	public void excute() {
		tv.on();
	}
	
}
