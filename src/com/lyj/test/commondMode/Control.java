package com.lyj.test.commondMode;

import java.util.ArrayList;
import java.util.List;

public class Control {
	private List<Commond> commondList=new ArrayList<Commond>();
	private Commond preCommond;
	public boolean addCommond(Commond commond){
		preCommond=commond;
		return 	commondList.add(commond);
	}
	public boolean removeCommond(Commond commond){
		return commondList.remove(commond);
	}
	public void excute (){
		for(int i=0;i<commondList.size();i++){
			commondList.get(i).excute();
		}
	}
	public Commond getPreCommond() {
		return preCommond;
	}
	public void setPreCommond(Commond preCommond) {
		this.preCommond = preCommond;
	}
	public List<Commond> getCommondList() {
		return commondList;
	}
	public void setCommondList(List<Commond> commondList) {
		this.commondList = commondList;
	}
	 
}
